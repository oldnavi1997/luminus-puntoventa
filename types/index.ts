export interface PrescriptionData {
  od: { sphere: string; cylinder: string; axis: string };
  oi: { sphere: string; cylinder: string; axis: string };
  add?: string;
  pd?: string;
}

export interface PosCartItem {
  id: string;
  cartKey: string;
  name: string;
  sku?: string | null;
  price: number;
  editedPrice?: number;
  imageUrl?: string;
  quantity: number;
  stock: number;
  slug: string;
  // Lens
  lensType?: "sin_medida" | "con_medida" | "solo_montura";
  lensSubType?: string;
  lensVariant?: string;
  lensPrice?: number;
  lensPriceRange?: string;
  prescription?: PrescriptionData;
}

export interface PosCustomer {
  id?: string;
  docType: string;
  docNumber: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface SaleDocumentSummary {
  id: string;
  fullNumber: string;
  type: "BOLETA" | "FACTURA";
  status: string;
  total: number;
  buyerName?: string | null;
  paymentMethod: string;
  createdAt: string;
  pdfUrl?: string | null;
  qrCode?: string | null;
}

export interface ProductForPOS {
  id: string;
  name: string;
  slug: string;
  price: number;
  storePrice: number | null;
  sku: string | null;
  stock: number;
  stockTienda: number;
  stockAlmacen: number;
  trackInventory: boolean;
  images: string[];
  brand?: string | null;
  requiresLensSelection: boolean;
  categories: { id: string; name: string; requiresLensSelection: boolean }[];
}

export type StockSource = "TIENDA" | "ALMACEN";
