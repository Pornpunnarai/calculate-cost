export type Unit = {
  id: string;
  name: string;
  symbol: string;
  is_builtin: boolean;
  created_at: string;
};

export type Ingredient = {
  id: string;
  name: string;
  purchase_quantity: number;
  purchase_unit_id: string;
  purchase_price: number;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  selling_price: number | null;
  created_at: string;
  updated_at: string;
};

export type ProductIngredient = {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
};

export type SalesChannel = {
  id: string;
  name: string;
  fee_percent: number;
  created_at: string;
};

export type IngredientWithUnit = Ingredient & { unit: Unit };
