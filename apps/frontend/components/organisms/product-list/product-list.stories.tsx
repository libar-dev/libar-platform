import type { Story, StoryDefault } from "@ladle/react";
import { ProductList } from "./product-list";
import { productList, extendedProductList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Organisms/ProductList",
};
export default meta;

export const Default: Story = () => (
  <ProductList products={productList} onProductSelect={(id) => console.log("Selected:", id)} />
);
Default.meta = {
  description: "Product list with available products",
};

export const Empty: Story = () => (
  <ProductList products={[]} onProductSelect={(id) => console.log("Selected:", id)} />
);
Empty.meta = {
  description: "Product list with no products",
};

export const Loading: Story = () => (
  <ProductList
    products={undefined}
    isLoading
    onProductSelect={(id) => console.log("Selected:", id)}
  />
);
Loading.meta = {
  description: "Product list in loading state with skeleton",
};

export const ErrorState: Story = () => (
  <ProductList
    products={undefined}
    error="Failed to load products. Please check your connection and try again."
    onRetry={() => console.log("Retrying...")}
  />
);
ErrorState.meta = {
  description: "Product list in error state with retry button",
};

export const WithSelection: Story = () => (
  <ProductList
    products={productList}
    onProductSelect={(id) => console.log("Selected:", id)}
    selectedProductId="prod-002"
  />
);
WithSelection.meta = {
  description: "Product list with a product selected",
};

export const ExtendedList: Story = () => (
  <ProductList
    products={extendedProductList}
    onProductSelect={(id) => console.log("Selected:", id)}
  />
);
ExtendedList.meta = {
  description: "Product list with many products for pagination testing",
};
