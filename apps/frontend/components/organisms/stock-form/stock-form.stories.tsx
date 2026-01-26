import type { Story, StoryDefault } from "@ladle/react";
import { StockForm } from "./stock-form";
import { productList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Organisms/StockForm",
};
export default meta;

const stockFormProducts = productList.map((p) => ({
  productId: p.productId,
  productName: p.productName,
  availableQuantity: p.availableQuantity,
}));

export const Default: Story = () => (
  <div className="max-w-md">
    <StockForm
      products={stockFormProducts}
      onSubmit={async (data) => {
        console.log("Adding stock:", data);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }}
    />
  </div>
);
Default.meta = {
  description: "Stock form with product selection",
};

export const WithDefaultProduct: Story = () => (
  <div className="max-w-md">
    <StockForm
      products={stockFormProducts}
      defaultProductId="prod-003"
      onSubmit={async (data) => {
        console.log("Adding stock:", data);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }}
    />
  </div>
);
WithDefaultProduct.meta = {
  description: "Stock form with pre-selected product",
};

export const SuccessFeedback: Story = () => (
  <div className="max-w-md">
    <StockForm
      products={stockFormProducts}
      onSubmit={async (data) => console.log("Adding stock:", data)}
      successMessage="Successfully added 100 units to Ergonomic Keyboard!"
    />
  </div>
);
SuccessFeedback.meta = {
  description: "Stock form showing success message after submission",
};

export const Submitting: Story = () => (
  <div className="max-w-md">
    <StockForm
      products={stockFormProducts}
      onSubmit={async (data) => console.log("Adding stock:", data)}
      isSubmitting
    />
  </div>
);
Submitting.meta = {
  description: "Stock form in submitting state",
};

export const NoProducts: Story = () => (
  <div className="max-w-md">
    <StockForm products={[]} onSubmit={async (data) => console.log("Adding stock:", data)} />
  </div>
);
NoProducts.meta = {
  description: "Stock form when no products are available",
};
