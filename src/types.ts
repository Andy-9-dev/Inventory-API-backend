// Shared TypeScript interfaces for the Inventory API

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  product_id: string;
  quantity: number;
  status: "confirmed" | "rejected";
  created_at: string;
}

// Order row returned from the JOIN query (includes product name)
export interface OrderWithProduct extends Order {
  product_name: string;
}

// Request body shapes
export interface CreateProductBody {
  name: string;
  category: string;
  price: number;
  stock: number;
}

export interface StatsResponse {
  totalProducts: number;
  lowStockCount: number;    // products where stock < 10
  totalOrders: number;
  confirmedOrders: number;
  rejectedOrders: number;
}

export interface CreateOrderBody {
  product_id: string;
  quantity: number;
}
