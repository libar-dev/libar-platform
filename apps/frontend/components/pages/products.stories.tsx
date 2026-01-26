import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "@/components/templates/app-layout";
import { ProductList } from "@/components/organisms/product-list";
import { productList, extendedProductList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Pages/Products",
};
export default meta;

/**
 * Products page - browse product catalog
 */
export const Default: Story = () => (
  <AppLayout activeNav="products">
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <p className="text-muted-foreground">Browse and manage the product catalog</p>
      </div>

      {/* Product List */}
      <ProductList
        products={productList}
        onProductSelect={(id) => console.log("Selected product:", id)}
      />
    </div>
  </AppLayout>
);
Default.meta = {
  description: "Products page with product catalog grid",
};

/**
 * Products page - extended list with pagination-ready layout
 */
export const ExtendedList: Story = () => (
  <AppLayout activeNav="products">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Showing 10 of 24 products</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search products..."
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </div>

      <ProductList
        products={extendedProductList}
        onProductSelect={(id) => console.log("Selected product:", id)}
      />
    </div>
  </AppLayout>
);
ExtendedList.meta = {
  description: "Products page with more products and search placeholder",
};

/**
 * Products page - loading state
 */
export const Loading: Story = () => (
  <AppLayout activeNav="products">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <p className="text-muted-foreground">Browse and manage the product catalog</p>
      </div>

      <ProductList products={undefined} isLoading={true} />
    </div>
  </AppLayout>
);
Loading.meta = {
  description: "Products page in loading state",
};

/**
 * Products page - empty state
 */
export const Empty: Story = () => (
  <AppLayout activeNav="products">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <p className="text-muted-foreground">Browse and manage the product catalog</p>
      </div>

      <ProductList products={[]} />
    </div>
  </AppLayout>
);
Empty.meta = {
  description: "Products page with no products",
};
