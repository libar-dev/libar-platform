import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "./app-layout";
import { ProductList } from "@/components/organisms/product-list";
import { OrderList } from "@/components/organisms/order-list";
import { productList } from "@/components/__fixtures__/products";
import { orderList } from "@/components/__fixtures__/orders";

const meta: StoryDefault = {
  title: "Templates/AppLayout",
};
export default meta;

export const Default: Story = () => (
  <AppLayout>
    <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">Products</div>
        <div className="text-2xl font-bold">12</div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">Orders</div>
        <div className="text-2xl font-bold">48</div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">Pending</div>
        <div className="text-2xl font-bold">7</div>
      </div>
    </div>
  </AppLayout>
);
Default.meta = {
  description: "App layout with dashboard content",
};

export const ProductsPage: Story = () => (
  <AppLayout activeNav="products">
    <h1 className="text-2xl font-bold mb-4">Products</h1>
    <ProductList products={productList} onProductSelect={(id) => console.log("Selected:", id)} />
  </AppLayout>
);
ProductsPage.meta = {
  description: "App layout with products page content",
};

export const OrdersPage: Story = () => (
  <AppLayout activeNav="orders">
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium">
        New Order
      </button>
    </div>
    <OrderList orders={orderList} onOrderClick={(id) => console.log("Navigate to:", id)} />
  </AppLayout>
);
OrdersPage.meta = {
  description: "App layout with orders page content",
};

export const AdminPage: Story = () => (
  <AppLayout activeNav="admin">
    <h1 className="text-2xl font-bold mb-4">Admin</h1>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold mb-4">Create Product</h2>
        <p className="text-muted-foreground">Product creation form would go here.</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold mb-4">Add Stock</h2>
        <p className="text-muted-foreground">Stock management form would go here.</p>
      </div>
    </div>
  </AppLayout>
);
AdminPage.meta = {
  description: "App layout with admin page content",
};
