import type { Story, StoryDefault } from "@ladle/react";
import { AppLayout } from "@/components/templates/app-layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProductForm } from "@/components/organisms/product-form";
import { StockForm } from "@/components/organisms/stock-form";
import { ProductList } from "@/components/organisms/product-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productList, extendedProductList } from "@/components/__fixtures__/products";

const meta: StoryDefault = {
  title: "Pages/AdminProducts",
};
export default meta;

/**
 * Admin Products page - manage products and stock
 */
export const Default: Story = () => (
  <AppLayout activeNav="admin">
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin - Products</h1>
        <p className="text-muted-foreground">Create products and manage stock levels</p>
      </div>

      {/* Tabs for Create Product / Add Stock */}
      <Tabs defaultValue="create" className="space-y-6">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="stock">Add Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm
                onSubmit={async (data) => {
                  console.log("Creating product:", data);
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }}
                onCancel={() => console.log("Cancelled")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader>
              <CardTitle>Add Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <StockForm
                products={productList}
                onSubmit={async (data) => {
                  console.log("Adding stock:", data);
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Current Inventory */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Inventory</h2>
        <ProductList
          products={productList}
          onProductSelect={(id) => console.log("Selected product:", id)}
        />
      </div>
    </div>
  </AppLayout>
);
Default.meta = {
  description: "Admin page with tabs for product creation and stock management",
};

/**
 * Admin Products page - Add Stock tab active
 */
export const AddStockTab: Story = () => (
  <AppLayout activeNav="admin">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin - Products</h1>
        <p className="text-muted-foreground">Create products and manage stock levels</p>
      </div>

      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="stock">Add Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm
                onSubmit={async (data) => console.log("Creating:", data)}
                onCancel={() => {}}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader>
              <CardTitle>Add Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <StockForm
                products={productList}
                defaultProductId="prod-001"
                onSubmit={async (data) => console.log("Adding stock:", data)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Inventory</h2>
        <ProductList products={productList} />
      </div>
    </div>
  </AppLayout>
);
AddStockTab.meta = {
  description: "Admin page with Add Stock tab active and pre-selected product",
};

/**
 * Admin Products page - with success message
 */
export const WithSuccessMessage: Story = () => (
  <AppLayout activeNav="admin">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin - Products</h1>
        <p className="text-muted-foreground">Create products and manage stock levels</p>
      </div>

      {/* Success banner */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-medium text-green-800">
            Stock added successfully! 50 units added to Ergonomic Keyboard.
          </p>
        </div>
      </div>

      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="stock">Add Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm onSubmit={async () => {}} onCancel={() => {}} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader>
              <CardTitle>Add Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <StockForm
                products={productList}
                onSubmit={async () => {}}
                successMessage="Stock added successfully!"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Inventory</h2>
        <ProductList products={productList} />
      </div>
    </div>
  </AppLayout>
);
WithSuccessMessage.meta = {
  description: "Admin page showing success message after stock addition",
};

/**
 * Admin Products page - with validation errors
 */
export const WithValidationErrors: Story = () => (
  <AppLayout activeNav="admin">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin - Products</h1>
        <p className="text-muted-foreground">Create products and manage stock levels</p>
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="stock">Add Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm
                onSubmit={async () => {}}
                onCancel={() => {}}
                errors={{
                  sku: "A product with this SKU already exists",
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader>
              <CardTitle>Add Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <StockForm products={productList} onSubmit={async () => {}} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Inventory</h2>
        <ProductList products={productList} />
      </div>
    </div>
  </AppLayout>
);
WithValidationErrors.meta = {
  description: "Admin page showing validation error on product form",
};

/**
 * Admin Products page - extended inventory
 */
export const ExtendedInventory: Story = () => (
  <AppLayout activeNav="admin">
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin - Products</h1>
        <p className="text-muted-foreground">Managing 10 products in inventory</p>
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="stock">Add Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Product</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductForm onSubmit={async () => {}} onCancel={() => {}} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader>
              <CardTitle>Add Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <StockForm products={extendedProductList} onSubmit={async () => {}} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Current Inventory (10 products)</h2>
        <ProductList products={extendedProductList} />
      </div>
    </div>
  </AppLayout>
);
ExtendedInventory.meta = {
  description: "Admin page with extended product inventory",
};
