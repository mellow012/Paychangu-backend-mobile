// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * P2PEscrow: the escrow RULES for the Escrow Malawi marketplace.
 *
 * No money is held here. Fiat is collected by PayChangu; this contract is the
 * tamper-proof record of each trade's lifecycle and the referee that decides
 * which state changes are allowed, who may make them, and when they time out.
 *
 *   Pending -> Accepted -> Funded -> Delivered -> Completed
 *                 |           |          |
 *                 v           v          v
 *             Rejected    Refunded    Disputed -> Completed | Refunded
 *
 * Timeout rules can be triggered by ANYONE once the deadline has passed
 * (expirePending, cancelUnpaid, autoRefund, autoRelease), so no single party
 * can stall a trade. Timeouts are in seconds and adjustable by the arbiter,
 * so they can be shortened for a live demo.
 */
contract P2PEscrow {
    enum Status {
        None,       // 0 trade doesn't exist
        Pending,    // 1 buyer requested, waiting for seller
        Accepted,   // 2 seller accepted, waiting for payment
        Funded,     // 3 payment recorded, waiting for delivery
        Delivered,  // 4 seller marked delivered, waiting for buyer
        Completed,  // 5 funds released to seller
        Refunded,   // 6 buyer refunded
        Rejected,   // 7 rejected, expired or cancelled before payment
        Disputed    // 8 frozen until the arbiter resolves it
    }

    struct Trade {
        address buyer;
        address seller;
        uint256 amount;      // MWK (display units, no value is held here)
        bytes32 paymentRef;  // hash of the PayChangu payment reference
        Status status;
        uint64 createdAt;
        uint64 acceptedAt;
        uint64 fundedAt;
        uint64 deliveredAt;
    }

    address public arbiter;  // resolves disputes, sets timeouts
    address public oracle;   // optional backend address allowed to record payments

    uint64 public pendingTimeout;      // seller must respond within
    uint64 public unpaidTimeout;       // buyer must pay within (after accept)
    uint64 public undeliveredTimeout;  // seller must deliver within (after payment)
    uint64 public confirmWindow;       // buyer must confirm within (after delivery)

    mapping(bytes32 => Trade) public trades;

    event TradeCreated(bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount);
    event TradeAccepted(bytes32 indexed id);
    event TradeRejected(bytes32 indexed id, string reason);
    event PaymentRecorded(bytes32 indexed id, bytes32 paymentRef, address recordedBy);
    event TradeDelivered(bytes32 indexed id);
    event TradeCompleted(bytes32 indexed id, string reason);
    event TradeRefunded(bytes32 indexed id, string reason);
    event DisputeOpened(bytes32 indexed id, address indexed openedBy, bytes32 evidenceHash);
    event DisputeResolved(bytes32 indexed id, bool releasedToSeller);
    event TimeoutsChanged(uint64 pending, uint64 unpaid, uint64 undelivered, uint64 confirm);

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only the arbiter");
        _;
    }

    constructor(
        address _arbiter,
        uint64 _pendingTimeout,
        uint64 _unpaidTimeout,
        uint64 _undeliveredTimeout,
        uint64 _confirmWindow
    ) {
        require(_arbiter != address(0), "Arbiter required");
        arbiter = _arbiter;
        _setTimeouts(_pendingTimeout, _unpaidTimeout, _undeliveredTimeout, _confirmWindow);
    }

    // ── Buyer / seller actions ──────────────────────────────────────────

    /// Buyer requests a trade. `id` is the keccak256 of the Firestore trade id.
    function createTrade(bytes32 id, address seller, uint256 amount) external {
        require(trades[id].status == Status.None, "Trade already exists");
        require(seller != address(0), "Seller required");
        require(seller != msg.sender, "Buyer and seller must differ");
        require(amount > 0, "Amount must be positive");

        Trade storage t = trades[id];
        t.buyer = msg.sender;
        t.seller = seller;
        t.amount = amount;
        t.status = Status.Pending;
        t.createdAt = _now();
        emit TradeCreated(id, msg.sender, seller, amount);
    }

    function acceptTrade(bytes32 id) external {
        Trade storage t = _expect(id, Status.Pending);
        require(msg.sender == t.seller, "Only the seller");
        t.status = Status.Accepted;
        t.acceptedAt = _now();
        emit TradeAccepted(id);
    }

    function rejectTrade(bytes32 id) external {
        Trade storage t = _expect(id, Status.Pending);
        require(msg.sender == t.seller, "Only the seller");
        t.status = Status.Rejected;
        emit TradeRejected(id, "Rejected by seller");
    }

    /// Records that PayChangu confirmed payment. Buyer or the oracle may call it.
    function recordPayment(bytes32 id, bytes32 paymentRef) external {
        Trade storage t = _expect(id, Status.Accepted);
        require(msg.sender == t.buyer || (oracle != address(0) && msg.sender == oracle), "Only buyer or oracle");
        require(paymentRef != bytes32(0), "Payment reference required");
        t.status = Status.Funded;
        t.paymentRef = paymentRef;
        t.fundedAt = _now();
        emit PaymentRecorded(id, paymentRef, msg.sender);
    }

    function markDelivered(bytes32 id) external {
        Trade storage t = _expect(id, Status.Funded);
        require(msg.sender == t.seller, "Only the seller");
        t.status = Status.Delivered;
        t.deliveredAt = _now();
        emit TradeDelivered(id);
    }

    /// Buyer confirms receipt (allowed once funded, even before the seller marks delivery).
    function confirmReceipt(bytes32 id) external {
        Trade storage t = _get(id);
        require(t.status == Status.Funded || t.status == Status.Delivered, "Not awaiting confirmation");
        require(msg.sender == t.buyer, "Only the buyer");
        t.status = Status.Completed;
        emit TradeCompleted(id, "Confirmed by buyer");
    }

    /// Seller voluntarily refunds the buyer.
    function sellerRefund(bytes32 id) external {
        Trade storage t = _get(id);
        require(t.status == Status.Funded || t.status == Status.Delivered, "Nothing to refund");
        require(msg.sender == t.seller, "Only the seller");
        t.status = Status.Refunded;
        emit TradeRefunded(id, "Refunded by seller");
    }

    /// Either party freezes a funded trade. Evidence itself stays off-chain; only its hash is recorded.
    function openDispute(bytes32 id, bytes32 evidenceHash) external {
        Trade storage t = _get(id);
        require(t.status == Status.Funded || t.status == Status.Delivered, "Cannot dispute in this state");
        require(msg.sender == t.buyer || msg.sender == t.seller, "Only a party to the trade");
        t.status = Status.Disputed;
        emit DisputeOpened(id, msg.sender, evidenceHash);
    }

    // ── Timeout rules: anyone can trigger once the deadline has passed ──

    function expirePending(bytes32 id) external {
        Trade storage t = _expect(id, Status.Pending);
        require(_now() >= t.createdAt + pendingTimeout, "Not expired yet");
        t.status = Status.Rejected;
        emit TradeRejected(id, "Seller did not respond in time");
    }

    function cancelUnpaid(bytes32 id) external {
        Trade storage t = _expect(id, Status.Accepted);
        require(_now() >= t.acceptedAt + unpaidTimeout, "Payment window still open");
        t.status = Status.Rejected;
        emit TradeRejected(id, "Buyer did not pay in time");
    }

    function autoRefund(bytes32 id) external {
        Trade storage t = _expect(id, Status.Funded);
        require(_now() >= t.fundedAt + undeliveredTimeout, "Delivery window still open");
        t.status = Status.Refunded;
        emit TradeRefunded(id, "Seller did not deliver in time");
    }

    function autoRelease(bytes32 id) external {
        Trade storage t = _expect(id, Status.Delivered);
        require(_now() >= t.deliveredAt + confirmWindow, "Confirm window still open");
        t.status = Status.Completed;
        emit TradeCompleted(id, "Buyer did not respond after delivery");
    }

    // ── Arbiter ─────────────────────────────────────────────────────────

    function resolveDispute(bytes32 id, bool releaseToSeller) external onlyArbiter {
        Trade storage t = _expect(id, Status.Disputed);
        if (releaseToSeller) {
            t.status = Status.Completed;
            emit TradeCompleted(id, "Dispute resolved for seller");
        } else {
            t.status = Status.Refunded;
            emit TradeRefunded(id, "Dispute resolved for buyer");
        }
        emit DisputeResolved(id, releaseToSeller);
    }

    function setTimeouts(uint64 p, uint64 u, uint64 d, uint64 c) external onlyArbiter {
        _setTimeouts(p, u, d, c);
    }

    function setOracle(address _oracle) external onlyArbiter {
        oracle = _oracle;
    }

    function transferArbiter(address newArbiter) external onlyArbiter {
        require(newArbiter != address(0), "Arbiter required");
        arbiter = newArbiter;
    }

    // ── Views ───────────────────────────────────────────────────────────

    function statusOf(bytes32 id) external view returns (uint8) {
        return uint8(trades[id].status);
    }

    // ── Internals ───────────────────────────────────────────────────────

    function _get(bytes32 id) private view returns (Trade storage t) {
        t = trades[id];
        require(t.status != Status.None, "Trade not found");
    }

    function _expect(bytes32 id, Status s) private view returns (Trade storage t) {
        t = _get(id);
        require(t.status == s, "Wrong trade state");
    }

    function _setTimeouts(uint64 p, uint64 u, uint64 d, uint64 c) private {
        require(p > 0 && u > 0 && d > 0 && c > 0, "Timeouts must be positive");
        pendingTimeout = p;
        unpaidTimeout = u;
        undeliveredTimeout = d;
        confirmWindow = c;
        emit TimeoutsChanged(p, u, d, c);
    }

    function _now() private view returns (uint64) {
        return uint64(block.timestamp);
    }
}
