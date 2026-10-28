using { bookstore } from '../db';

/**
 * Tools for the owner of the book shop: look up books, authors, orders and returns, and decide on orders and returns.
 * Customer names, ship-to addresses and customer comments are not available here.
 */
// MCP only (no OData): the adapter serves this service at /mcp/book-admin. Same role as AdminService. Read-only projections
// on the db entities, so AdminService's rules do not apply to them: this service has its own @requires. The actions delegate to
// AdminService (srv/book-admin-mcp-service.js), which keeps the review rules, the reason checks and the BookAdmin restriction in one place.
// The adapter sends @mcp.instructions of the service only (not of entities or actions, checked in @cap-js/mcp 1.5.0), so all
// guidance for the LLM is in that one text. The query tool takes free CQL: srv/lib/mcp-admin.js refuses subqueries and joins.
@mcp: 'book-admin'
@requires: 'BookAdmin'
@cds.query.limit: { default: 50, max: 200 }
@mcp.instructions: '{i18n>McpBookAdminInstructions}'
service BookAdminMcpService {

  /** A book offered in the shop. */
  @readonly
  entity Books as projection on bookstore.Books {
    /** The ID of the book. */
    key ID,
    /** The title of the book. */
    title,
    /** A short description of the book. */
    descr,
    /** The price in EUR. */
    price,
    /** The number of copies in stock. */
    stock,
    /** The author of the book. */
    author,
    /** The genre code of the book, if one is set. */
    genre.code as genre
  };

  /** A person who wrote one or more books. */
  @readonly
  entity Authors as projection on bookstore.Authors {
    /** The ID of the author. */
    key ID,
    /** The name of the author. */
    name,
    /** All books written by the author. */
    books : redirected to Books
  };

  /** A customer order that was placed. Carts that were not placed are not listed. */
  @readonly
  entity Orders as projection on bookstore.Orders {
    /** The ID of the order, used by the order actions. */
    key ID,
    /** The order number the customer sees, for example ORD-2026-000123. */
    orderNumber,
    /** Placed, Accepted, Rejected or Cancelled. */
    status,
    /** The total of all items in EUR. */
    totalAmount,
    /** The currency of the amounts. */
    currency,
    /** When the order was placed. */
    placedAt,
    /** When the order was delivered. Empty until then. */
    deliveredAt,
    /** The reason the shop gave when it decided on the order. Shown to the customer. */
    decisionReason,
    /** When the shop decided on the order. */
    decidedAt,
    /** The books of the order. */
    items : redirected to OrderItems
  };

  /** One book of an order. */
  @readonly
  entity OrderItems as projection on bookstore.OrderItems {
    /** The ID of the order item. */
    key ID,
    /** The order this item belongs to. */
    order,
    /** The title of the ordered book. */
    book.title as bookTitle,
    /** The ordered quantity. */
    quantity,
    /** The price of one copy at the time of the order. */
    unitPrice,
    /** The quantity times the unit price. */
    lineTotal
  };

  /** A request of a customer to return delivered books. The comment of the customer is not available here. */
  @readonly
  entity Returns as projection on bookstore.Returns {
    /** The ID of the return, used by the return actions. */
    key ID,
    /** The return number the customer sees, for example RET-2026-000123. */
    returnNumber,
    /** The number of the order the books were bought with. */
    order.orderNumber as orderNumber,
    /** Requested, Approved, Rejected, Received, Refunded or Cancelled. */
    status,
    /** The refund in EUR. */
    refundAmount,
    /** The currency of the amounts. */
    currency,
    /** When the customer requested the return. */
    requestedAt,
    /** The reason the shop gave when it decided on the return. Shown to the customer. */
    decisionReason,
    /** When the shop decided on the return. */
    decidedAt,
    /** The books of the return. */
    items : redirected to ReturnItems
  };

  /** One book of a return. */
  @readonly
  entity ReturnItems as projection on bookstore.ReturnItems {
    /** The ID of the return item. */
    key ID,
    /** The return this item belongs to. */
    ![return],
    /** The title of the returned book. */
    orderItem.book.title as bookTitle,
    /** The quantity to return. */
    quantity,
    /** The reason code the customer chose. */
    reason.code as reason,
    /** The price of one copy at the time of the order. */
    unitPrice,
    /** The quantity times the unit price. */
    lineRefund
  };

  /**
   * Accepts a placed order. This cannot be undone: ask the user to confirm before you call it.
   * @param orderID The ID of the order (Orders.ID).
   * @param reason Optional text shown to the customer, at most 500 characters
   */
  action acceptOrder(orderID : UUID, reason : LargeString) returns Orders;

  /**
   * Rejects a placed order that was not delivered yet. The stock goes back. This cannot be undone: ask the user to confirm before you call it.
   * @param orderID The ID of the order (Orders.ID).
   * @param reason Required text shown to the customer, at most 500 characters
   */
  action rejectOrder(orderID : UUID, reason : LargeString) returns Orders;

  /**
   * Cancels a placed or accepted order that was not delivered yet. The stock goes back. This cannot be undone: ask the user to confirm before you call it.
   * @param orderID The ID of the order (Orders.ID).
   * @param reason Required text shown to the customer, at most 500 characters
   */
  action cancelOrder(orderID : UUID, reason : LargeString) returns Orders;

  /**
   * Approves a requested return. This cannot be undone: ask the user to confirm before you call it.
   * @param returnID The ID of the return (Returns.ID).
   * @param reason Optional text shown to the customer, at most 500 characters
   */
  action approveReturn(returnID : UUID, reason : LargeString) returns Returns;

  /**
   * Rejects a requested return. This cannot be undone: ask the user to confirm before you call it.
   * @param returnID The ID of the return (Returns.ID).
   * @param reason Required text shown to the customer, at most 500 characters
   */
  action rejectReturn(returnID : UUID, reason : LargeString) returns Returns;

  /**
   * Cancels a requested return. An approved return cannot be cancelled. This cannot be undone: ask the user to confirm before you call it.
   * @param returnID The ID of the return (Returns.ID).
   * @param reason Required text shown to the customer, at most 500 characters
   */
  action cancelReturn(returnID : UUID, reason : LargeString) returns Returns;
}
