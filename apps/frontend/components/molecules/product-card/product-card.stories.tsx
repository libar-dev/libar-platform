import type { Story, StoryDefault } from "@ladle/react";
import { ProductCard } from "./product-card";
import { mockProducts, productList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Molecules/ProductCard",
};
export default meta;

export const Default: Story = () => (
  <div className="w-[350px]">
    <ProductCard product={mockProducts.inStock} />
  </div>
);
Default.meta = {
  description: "Product card with normal stock levels",
};

export const LowStock: Story = () => (
  <div className="w-[350px]">
    <ProductCard product={mockProducts.lowStock} />
  </div>
);
LowStock.meta = {
  description: "Product card with low stock warning",
};

export const OutOfStock: Story = () => (
  <div className="w-[350px]">
    <ProductCard product={mockProducts.outOfStock} />
  </div>
);
OutOfStock.meta = {
  description: "Product card with out of stock indicator",
};

export const Selected: Story = () => (
  <div className="w-[350px]">
    <ProductCard
      product={mockProducts.inStock}
      onSelect={(id) => console.log("Selected:", id)}
      selected
    />
  </div>
);
Selected.meta = {
  description: "Product card in selected state",
};

export const Interactive: Story = () => (
  <div className="w-[350px]">
    <ProductCard
      product={mockProducts.highDemand}
      onSelect={(id) => console.log("Selected:", id)}
    />
  </div>
);
Interactive.meta = {
  description: "Product card with click handler (hover to see effect)",
};

export const Variants: Story = () => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {productList.slice(0, 6).map((product) => (
      <ProductCard
        key={product.productId}
        product={product}
        onSelect={(id) => console.log("Selected:", id)}
      />
    ))}
  </div>
);
Variants.meta = {
  description: "Multiple product cards showing different stock levels",
};
