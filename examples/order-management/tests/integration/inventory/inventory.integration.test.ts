/**
 * Inventory Integration Tests
 *
 * Uses real Convex backend via Docker for full system validation.
 * Tests the complete flow: commands → events → projections.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex-helpers/testing";
import { api } from "../../../convex/_generated/api";
import {
  generateProductId,
  generateSku,
  generateInventoryCommandId,
} from "../../fixtures/inventory";
import { generateOrderId } from "../../fixtures/orders";
import {
  waitUntil,
  waitForInventoryProjection,
  waitForReservationProjection,
} from "../../support/localBackendHelpers";
import { testMutation, testQuery } from "../../support/integrationHelpers";

describe("Inventory Integration Tests", () => {
  let t: ConvexTestingHelper;

  beforeEach(() => {
    t = new ConvexTestingHelper({
      backendUrl: process.env.CONVEX_URL || "http://127.0.0.1:3210",
    });
  });

  afterEach(async () => {
    // No clearAll needed - namespace isolation via testRunId prefix
    await t.close();
  });

  // ==========================================================================
  // CreateProduct Tests
  // ==========================================================================

  describe("CreateProduct", () => {
    it("should create a new product successfully", async () => {
      const productId = generateProductId();
      const productName = "Test Widget";
      const sku = generateSku();

      const result = await testMutation(t, api.inventory.createProduct, {
        productId,
        productName,
        sku,
        unitPrice: 29.99,
      });

      expect(result.status).toBe("success");
      expect(result.eventId).toBeDefined();

      // Wait for projection to process
      await waitForInventoryProjection(t, productId);

      // Verify product exists in projection
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product).toBeDefined();
      expect(product?.productName).toBe(productName);
      expect(product?.sku).toBe(sku);
      expect(product?.availableQuantity).toBe(0);
    });

    it("should reject duplicate product ID", async () => {
      const productId = generateProductId();
      const sku1 = generateSku();
      const sku2 = generateSku();

      // Create first product
      const result1 = await testMutation(t, api.inventory.createProduct, {
        productId,
        productName: "First Product",
        sku: sku1,
        unitPrice: 29.99,
      });
      expect(result1.status).toBe("success");

      // Try to create again with same ID
      const result2 = await testMutation(t, api.inventory.createProduct, {
        productId,
        productName: "Second Product",
        sku: sku2,
        unitPrice: 19.99,
      });

      expect(result2.status).toBe("rejected");
      expect(result2.code).toBe("PRODUCT_ALREADY_EXISTS");
    });

    it("should reject duplicate SKU", async () => {
      const productId1 = generateProductId();
      const productId2 = generateProductId();
      const sku = generateSku();

      // Create first product
      const result1 = await testMutation(t, api.inventory.createProduct, {
        productId: productId1,
        productName: "First Product",
        sku,
        unitPrice: 29.99,
      });
      expect(result1.status).toBe("success");

      // Wait for projection
      await waitForInventoryProjection(t, productId1);

      // Try to create second product with same SKU
      const result2 = await testMutation(t, api.inventory.createProduct, {
        productId: productId2,
        productName: "Second Product",
        sku,
        unitPrice: 19.99,
      });

      expect(result2.status).toBe("rejected");
      expect(result2.code).toBe("SKU_ALREADY_EXISTS");
    });

    it("should be idempotent with same commandId", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const commandId = generateInventoryCommandId();

      // First call
      const result1 = await testMutation(t, api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku,
        unitPrice: 29.99,
        commandId,
      });
      expect(result1.status).toBe("success");

      // Second call with same commandId
      const result2 = await testMutation(t, api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku,
        unitPrice: 29.99,
        commandId,
      });

      expect(result2.status).toBe("duplicate");
    });
  });

  // ==========================================================================
  // AddStock Tests
  // ==========================================================================

  describe("AddStock", () => {
    it("should add stock to existing product", async () => {
      const productId = generateProductId();
      const sku = generateSku();

      // Create product first
      await testMutation(t, api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku,
        unitPrice: 29.99,
      });

      await waitForInventoryProjection(t, productId);

      // Add stock
      const addResult = await testMutation(t, api.inventory.addStock, {
        productId,
        quantity: 50,
        reason: "Initial stock",
      });

      expect(addResult.status).toBe("success");

      // Wait for projection to update
      await waitUntil(
        async () => {
          const product = await testQuery(t, api.inventory.getProduct, { productId });
          return product?.availableQuantity === 50;
        },
        { message: "Stock update projection" }
      );

      // Verify
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.availableQuantity).toBe(50);
    });

    it("should reject adding stock to non-existent product", async () => {
      const productId = generateProductId();

      const result = await testMutation(t, api.inventory.addStock, {
        productId,
        quantity: 10,
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("should be idempotent with same commandId", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const commandId = generateInventoryCommandId();

      // Create product
      await testMutation(t, api.inventory.createProduct, {
        productId,
        productName: "Test Product",
        sku,
        unitPrice: 29.99,
      });
      await waitForInventoryProjection(t, productId);

      // First add stock
      const result1 = await testMutation(t, api.inventory.addStock, {
        productId,
        quantity: 10,
        commandId,
      });
      expect(result1.status).toBe("success");

      // Second add with same commandId
      const result2 = await testMutation(t, api.inventory.addStock, {
        productId,
        quantity: 10,
        commandId,
      });

      expect(result2.status).toBe("duplicate");
    });
  });

  // ==========================================================================
  // ReserveStock Tests
  // ==========================================================================

  describe("ReserveStock", () => {
    it("should reserve available stock successfully", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product with stock
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
      });

      // Reserve stock
      const result = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId, quantity: 5 }],
      });

      expect(result.status).toBe("success");
      expect(result.data?.reservationId).toBeDefined();

      // Wait for projections
      await waitUntil(
        async () => {
          const product = await testQuery(t, api.inventory.getProduct, { productId });
          return product?.availableQuantity === 15 && product?.reservedQuantity === 5;
        },
        { message: "Stock reservation projection" }
      );

      // Verify product stock updated
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.availableQuantity).toBe(15);
      expect(product?.reservedQuantity).toBe(5);

      // Verify reservation created
      const reservationId = result.data?.reservationId as string;
      const reservation = await testQuery(t, api.inventory.getReservation, { reservationId });
      expect(reservation?.status).toBe("pending");
      expect(reservation?.orderId).toBe(orderId);
    });

    it("should fail when insufficient stock", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product with limited stock
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Limited Stock Product",
        sku,
        availableQuantity: 3,
      });

      // Try to reserve more than available
      const result = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId, quantity: 10 }],
      });

      expect(result.status).toBe("failed");
      expect(result.reason).toBeDefined();
      expect(result.eventId).toBeDefined(); // ReservationFailed event should be emitted
    });

    it("should handle multi-item reservation", async () => {
      const productId1 = generateProductId();
      const productId2 = generateProductId();
      const sku1 = generateSku();
      const sku2 = generateSku();
      const orderId = generateOrderId();

      // Setup: Create two products with stock
      await testMutation(t, api.testing.createTestProduct, {
        productId: productId1,
        productName: "Product 1",
        sku: sku1,
        availableQuantity: 20,
      });

      await testMutation(t, api.testing.createTestProduct, {
        productId: productId2,
        productName: "Product 2",
        sku: sku2,
        availableQuantity: 15,
      });

      // Reserve from both
      const result = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [
          { productId: productId1, quantity: 5 },
          { productId: productId2, quantity: 3 },
        ],
      });

      expect(result.status).toBe("success");

      // Wait and verify both products updated
      await waitUntil(
        async () => {
          const p1 = await testQuery(t, api.inventory.getProduct, { productId: productId1 });
          const p2 = await testQuery(t, api.inventory.getProduct, { productId: productId2 });
          return p1?.availableQuantity === 15 && p2?.availableQuantity === 12;
        },
        { message: "Multi-item reservation projection" }
      );
    });

    it("should be all-or-nothing for multi-item reservation", async () => {
      const productId1 = generateProductId();
      const productId2 = generateProductId();
      const sku1 = generateSku();
      const sku2 = generateSku();
      const orderId = generateOrderId();

      // Setup: First product has stock, second has limited
      await testMutation(t, api.testing.createTestProduct, {
        productId: productId1,
        productName: "Product 1",
        sku: sku1,
        availableQuantity: 100,
      });

      await testMutation(t, api.testing.createTestProduct, {
        productId: productId2,
        productName: "Product 2",
        sku: sku2,
        availableQuantity: 2, // Not enough
      });

      // Try to reserve both - should fail for all
      const result = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [
          { productId: productId1, quantity: 5 },
          { productId: productId2, quantity: 10 }, // More than available
        ],
      });

      expect(result.status).toBe("failed");

      // Verify neither product's stock was changed
      const p1 = await testQuery(t, api.inventory.getProduct, { productId: productId1 });
      expect(p1?.availableQuantity).toBe(100);
      expect(p1?.reservedQuantity).toBe(0);
    });

    it("should fail for non-existent product (treated as 0 stock)", async () => {
      const orderId = generateOrderId();
      const fakeProductId = generateProductId();

      // Non-existent products are treated as having 0 stock (all-or-nothing pattern)
      const result = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId: fakeProductId, quantity: 5 }],
      });

      expect(result.status).toBe("failed");
      expect(result.reason).toContain("Insufficient stock");
    });

    it("should be idempotent with same commandId", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();
      const commandId = generateInventoryCommandId();

      // Setup
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
      });

      // First reservation
      const result1 = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId, quantity: 5 }],
        commandId,
      });
      expect(result1.status).toBe("success");

      // Second with same commandId
      const result2 = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId, quantity: 5 }],
        commandId,
      });

      expect(result2.status).toBe("duplicate");
    });
  });

  // ==========================================================================
  // ConfirmReservation Tests
  // ==========================================================================

  describe("ConfirmReservation", () => {
    it("should confirm pending reservation", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product and reservation
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
      });

      const reserveResult = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId, quantity: 5 }],
      });

      const reservationId = reserveResult.data?.reservationId as string;
      await waitForReservationProjection(t, reservationId);

      // Confirm reservation
      const confirmResult = await testMutation(t, api.inventory.confirmReservation, {
        reservationId,
      });

      expect(confirmResult.status).toBe("success");

      // Wait for projection to update
      await waitUntil(
        async () => {
          const reservation = await testQuery(t, api.inventory.getReservation, { reservationId });
          return reservation?.status === "confirmed";
        },
        { message: "Reservation confirmation projection" }
      );

      // Verify
      const reservation = await testQuery(t, api.inventory.getReservation, { reservationId });
      expect(reservation?.status).toBe("confirmed");
    });

    it("should reject confirming already confirmed reservation", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup with already confirmed reservation via test helper
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
        reservedQuantity: 5,
      });

      const { reservationId } = await testMutation(t, api.testing.createTestReservation, {
        reservationId: `res_${Date.now()}`,
        orderId,
        items: [{ productId, quantity: 5 }],
        status: "confirmed",
      });

      // Try to confirm again
      const result = await testMutation(t, api.inventory.confirmReservation, {
        reservationId,
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("RESERVATION_NOT_PENDING");
    });

    it("should reject confirming non-existent reservation", async () => {
      const fakeReservationId = `res_fake_${Date.now()}`;

      const result = await testMutation(t, api.inventory.confirmReservation, {
        reservationId: fakeReservationId,
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("RESERVATION_NOT_FOUND");
    });
  });

  // ==========================================================================
  // ReleaseReservation Tests
  // ==========================================================================

  describe("ReleaseReservation", () => {
    it("should release reservation and return stock", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product and make a reservation
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
      });

      const reserveResult = await testMutation(t, api.inventory.reserveStock, {
        orderId,
        items: [{ productId, quantity: 5 }],
      });

      const reservationId = reserveResult.data?.reservationId as string;

      // Wait for reservation and stock update
      await waitUntil(
        async () => {
          const product = await testQuery(t, api.inventory.getProduct, { productId });
          return product?.reservedQuantity === 5;
        },
        { message: "Reservation stock update" }
      );

      // Release reservation
      const releaseResult = await testMutation(t, api.inventory.releaseReservation, {
        reservationId,
        reason: "Order cancelled",
      });

      expect(releaseResult.status).toBe("success");

      // Wait for stock to be returned
      await waitUntil(
        async () => {
          const product = await testQuery(t, api.inventory.getProduct, { productId });
          return product?.availableQuantity === 20 && product?.reservedQuantity === 0;
        },
        { message: "Stock return projection" }
      );

      // Verify
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.availableQuantity).toBe(20);
      expect(product?.reservedQuantity).toBe(0);

      const reservation = await testQuery(t, api.inventory.getReservation, { reservationId });
      expect(reservation?.status).toBe("released");
    });

    it("should reject releasing already-released reservation", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup with already-released reservation (terminal state)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
        reservedQuantity: 0, // No reserved quantity since reservation is already released
      });

      const { reservationId } = await testMutation(t, api.testing.createTestReservation, {
        reservationId: `res_${Date.now()}`,
        orderId,
        items: [{ productId, quantity: 5 }],
        status: "released", // Terminal state - cannot be released again
      });

      // Try to release already-released reservation
      const result = await testMutation(t, api.inventory.releaseReservation, {
        reservationId,
        reason: "Testing",
      });

      expect(result.status).toBe("rejected");
      expect(result.code).toBe("RESERVATION_NOT_PENDING");
    });
  });

  // ==========================================================================
  // Query APIs Tests
  // ==========================================================================

  describe("Query APIs", () => {
    it("should list products", async () => {
      // Create multiple products
      const products = [];
      for (let i = 0; i < 3; i++) {
        const productId = generateProductId();
        const sku = generateSku();
        await testMutation(t, api.testing.createTestProduct, {
          productId,
          productName: `Product ${i + 1}`,
          sku,
          availableQuantity: (i + 1) * 10,
        });
        products.push(productId);
      }

      const allProducts = await testQuery(t, api.inventory.listProducts, {});
      expect(allProducts.length).toBeGreaterThanOrEqual(3);
    });

    it("should get stock availability", async () => {
      const productId = generateProductId();
      const sku = generateSku();

      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 50,
        reservedQuantity: 10,
      });

      const availability = await testQuery(t, api.inventory.getStockAvailability, { productId });
      expect(availability?.availableQuantity).toBe(50);
      expect(availability?.reservedQuantity).toBe(10);
    });

    it("should check availability for multiple items", async () => {
      const productId1 = generateProductId();
      const productId2 = generateProductId();
      const sku1 = generateSku();
      const sku2 = generateSku();

      await testMutation(t, api.testing.createTestProduct, {
        productId: productId1,
        productName: "Product 1",
        sku: sku1,
        availableQuantity: 20,
      });

      await testMutation(t, api.testing.createTestProduct, {
        productId: productId2,
        productName: "Product 2",
        sku: sku2,
        availableQuantity: 5,
      });

      // Check availability for amounts within stock
      const result1 = await testQuery(t, api.inventory.checkAvailability, {
        items: [
          { productId: productId1, quantity: 10 },
          { productId: productId2, quantity: 3 },
        ],
      });
      expect(result1?.allAvailable).toBe(true);

      // Check availability for amounts exceeding stock
      const result2 = await testQuery(t, api.inventory.checkAvailability, {
        items: [
          { productId: productId1, quantity: 10 },
          { productId: productId2, quantity: 10 }, // Too much
        ],
      });
      expect(result2?.allAvailable).toBe(false);
    });

    it("should get reservation by order ID", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 20,
        reservedQuantity: 5,
      });

      await testMutation(t, api.testing.createTestReservation, {
        reservationId: `res_${Date.now()}`,
        orderId,
        items: [{ productId, quantity: 5 }],
        status: "pending",
      });

      const reservation = await testQuery(t, api.inventory.getReservationByOrderId, { orderId });
      expect(reservation).toBeDefined();
      expect(reservation?.orderId).toBe(orderId);
    });
  });

  // ==========================================================================
  // Reservation Expiration Tests
  // ==========================================================================

  describe("Reservation Expiration", () => {
    it("should expire expired pending reservations", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product with available stock (reservation will add reserved qty)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 25, // 20 available + 5 that will be reserved
        reservedQuantity: 0, // createTestReservation will set this
      });

      const reservationId = `res_${Date.now()}`;
      await testMutation(t, api.testing.createTestReservation, {
        reservationId,
        orderId,
        items: [{ productId, quantity: 5 }],
        status: "pending",
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      });

      // Wait for reservation projection to process
      await waitForReservationProjection(t, reservationId);

      // Trigger expiration process
      const expireResult = await testMutation(t, api.testing.expireExpiredReservations, {});

      expect(expireResult.processed).toBeGreaterThan(0);

      // Wait for projection to process expiration
      await waitUntil(
        async () => {
          const reservation = await testQuery(t, api.inventory.getReservation, {
            reservationId,
          });
          return reservation?.status === "expired";
        },
        { message: "Reservation expiration projection" }
      );

      // Verify reservation is expired
      const reservation = await testQuery(t, api.inventory.getReservation, {
        reservationId,
      });
      expect(reservation?.status).toBe("expired");

      // Verify stock was returned
      await waitUntil(
        async () => {
          const product = await testQuery(t, api.inventory.getProduct, { productId });
          return product?.availableQuantity === 25 && product?.reservedQuantity === 0;
        },
        { message: "Stock return after expiration projection" }
      );

      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.availableQuantity).toBe(25);
      expect(product?.reservedQuantity).toBe(0);
    });

    it("should not expire confirmed reservations", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product with available stock (reservation will add reserved qty)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 25, // 20 available + 5 that will be reserved
        reservedQuantity: 0, // createTestReservation will set this
      });

      const reservationId = `res_${Date.now()}`;
      await testMutation(t, api.testing.createTestReservation, {
        reservationId,
        orderId,
        items: [{ productId, quantity: 5 }],
        status: "confirmed",
        expiresAt: Date.now() - 1000, // Expired but confirmed
      });

      // Wait for reservation projection to process
      await waitForReservationProjection(t, reservationId);

      // Trigger expiration process
      await testMutation(t, api.testing.expireExpiredReservations, {});

      // Wait a bit to ensure processing is complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify reservation is still confirmed
      const reservation = await testQuery(t, api.inventory.getReservation, {
        reservationId,
      });
      expect(reservation?.status).toBe("confirmed");

      // Verify stock remains reserved
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.reservedQuantity).toBe(5);
    });

    it("should not expire future reservations", async () => {
      const productId = generateProductId();
      const sku = generateSku();
      const orderId = generateOrderId();

      // Setup: Create product with available stock (reservation will add reserved qty)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 25, // 20 available + 5 that will be reserved
        reservedQuantity: 0, // createTestReservation will set this
      });

      const reservationId = `res_${Date.now()}`;
      await testMutation(t, api.testing.createTestReservation, {
        reservationId,
        orderId,
        items: [{ productId, quantity: 5 }],
        status: "pending",
        expiresAt: Date.now() + 3600000, // Expires in 1 hour
      });

      // Wait for reservation projection to process
      await waitForReservationProjection(t, reservationId);

      // Trigger expiration process
      await testMutation(t, api.testing.expireExpiredReservations, {});

      // Wait a bit to ensure processing is complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify reservation is still pending
      const reservation = await testQuery(t, api.inventory.getReservation, {
        reservationId,
      });
      expect(reservation?.status).toBe("pending");

      // Verify stock remains reserved
      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.reservedQuantity).toBe(5);
    });

    it("should handle multiple expired reservations in batch", async () => {
      const productId = generateProductId();
      const sku = generateSku();

      // Setup: Create product with available stock (reservations will add reserved qty)
      await testMutation(t, api.testing.createTestProduct, {
        productId,
        productName: "Test Product",
        sku,
        availableQuantity: 65, // 50 available + 15 that will be reserved (3 x 5)
        reservedQuantity: 0, // createTestReservation will set this
      });

      const reservations = [];
      for (let i = 0; i < 3; i++) {
        const reservationId = `res_${Date.now()}_${i}`;
        const orderId = `ord_${Date.now()}_${i}`;
        reservations.push({ reservationId, orderId });

        await testMutation(t, api.testing.createTestReservation, {
          reservationId,
          orderId,
          items: [{ productId, quantity: 5 }],
          status: "pending",
          expiresAt: Date.now() - 1000, // All expired
        });

        await waitForReservationProjection(t, reservationId);
      }

      // Trigger expiration process
      const expireResult = await testMutation(t, api.testing.expireExpiredReservations, {});

      expect(expireResult.processed).toBe(3);

      // Wait for all reservations to be expired
      await waitUntil(
        async () => {
          const allExpired = await Promise.all(
            reservations.map(async ({ reservationId }) => {
              const res = await testQuery(t, api.inventory.getReservation, {
                reservationId,
              });
              return res?.status === "expired";
            })
          );
          return allExpired.every((expired) => expired);
        },
        { message: "All reservations expired", timeout: 10000 }
      );

      // Verify all are expired
      for (const { reservationId } of reservations) {
        const reservation = await testQuery(t, api.inventory.getReservation, {
          reservationId,
        });
        expect(reservation?.status).toBe("expired");
      }

      // Verify all stock was returned
      await waitUntil(
        async () => {
          const product = await testQuery(t, api.inventory.getProduct, { productId });
          return product?.availableQuantity === 65 && product?.reservedQuantity === 0;
        },
        { message: "All stock returned", timeout: 10000 }
      );

      const product = await testQuery(t, api.inventory.getProduct, { productId });
      expect(product?.availableQuantity).toBe(65);
      expect(product?.reservedQuantity).toBe(0);
    });
  });
});
