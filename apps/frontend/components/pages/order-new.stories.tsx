import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "@/components/templates/app-layout";
import { OrderCreateForm } from "@/components/organisms/order-create-form";
import { productList, extendedProductList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Pages/OrderNew",
};
export default meta;

/**
 * Create Order page - form for creating new orders
 */
export const Default: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Order</h1>
        <p className="text-muted-foreground">Select products and quantities for a new order</p>
      </div>

      {/* Order Form */}
      <OrderCreateForm
        products={productList}
        onSubmit={async (items) => {
          console.log("Submitting order:", items);
          // Simulate API delay
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }}
        onCancel={() => console.log("Cancelled - navigate back to orders")}
      />
    </div>
  </AppLayout>
);
Default.meta = {
  description: "Create order page with product selection and cart",
};

/**
 * Create Order page with extended product catalog
 */
export const ExtendedCatalog: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Order</h1>
        <p className="text-muted-foreground">Select products and quantities for a new order</p>
      </div>

      <OrderCreateForm
        products={extendedProductList}
        onSubmit={async (items) => {
          console.log("Submitting order:", items);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }}
        onCancel={() => console.log("Cancelled")}
      />
    </div>
  </AppLayout>
);
ExtendedCatalog.meta = {
  description: "Create order page with more products available",
};

/**
 * Create Order page - submitting state
 */
export const Submitting: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Order</h1>
        <p className="text-muted-foreground">Select products and quantities for a new order</p>
      </div>

      <OrderCreateForm
        products={productList}
        onSubmit={async () => {
          // This will show submitting state
          await new Promise(() => {}); // Never resolves
        }}
        onCancel={() => {}}
        isSubmitting={true}
      />
    </div>
  </AppLayout>
);
Submitting.meta = {
  description: "Create order page in submitting state",
};

/**
 * Create Order page - no products available
 */
export const NoProducts: Story = () => (
  <AppLayout activeNav="orders">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Order</h1>
        <p className="text-muted-foreground">No products available for ordering</p>
      </div>

      <OrderCreateForm
        products={[]}
        onSubmit={async () => {}}
        onCancel={() => console.log("Cancelled")}
      />
    </div>
  </AppLayout>
);
NoProducts.meta = {
  description: "Create order page with no products available",
};
