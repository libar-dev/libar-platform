import type { Story, StoryDefault } from "@ladle/react";
import { ProductForm } from "./product-form";

const meta: StoryDefault = {
  title: "Organisms/ProductForm",
};
export default meta;

export const Default: Story = () => (
  <div className="max-w-md">
    <ProductForm
      onSubmit={async (data) => {
        console.log("Creating product:", data);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }}
      onCancel={() => console.log("Cancelled")}
    />
  </div>
);
Default.meta = {
  description: "Product creation form with auto-generated ID",
};

export const WithValidationErrors: Story = () => (
  <div className="max-w-md">
    <ProductForm
      onSubmit={async (data) => console.log("Creating product:", data)}
      onCancel={() => console.log("Cancelled")}
      errors={{
        productName: "Product name already exists",
        sku: "SKU format is invalid",
      }}
    />
  </div>
);
WithValidationErrors.meta = {
  description: "Product form showing server-side validation errors",
};

export const Submitting: Story = () => (
  <div className="max-w-md">
    <ProductForm
      onSubmit={async (data) => console.log("Creating product:", data)}
      onCancel={() => console.log("Cancelled")}
      isSubmitting
    />
  </div>
);
Submitting.meta = {
  description: "Product form in submitting state",
};

export const WithoutCancel: Story = () => (
  <div className="max-w-md">
    <ProductForm
      onSubmit={async (data) => {
        console.log("Creating product:", data);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }}
    />
  </div>
);
WithoutCancel.meta = {
  description: "Product form without cancel button",
};
