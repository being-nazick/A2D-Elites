export const C = {
  bg: "#FBF7F0",
  paper: "#FFFFFF",
  paperLine: "#EAE1D0",
  ink: "#2A2320",
  inkMute: "#8A7F70",
  primary: "#1E4B42",
  primaryDark: "#123530",
  primarySoft: "#E4EEE9",
  gold: "#C08A28",
  goldSoft: "#F7ECD6",
  brick: "#B54A3B",
  brickSoft: "#F6E3DE",
  green: "#3E7A56",
  greenSoft: "#E3EFE6",
  cream: "#F1E9D8",
};

export const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

export const BUSINESS_NAME = "A2D'Elites";
export const BUSINESS_TAGLINE = "Since 2025";

export const DEFAULT_PRODUCTS = [
  { id: "p_milk_500ml", name: "Milk Bottle (500 ml)", category: "Milk", unit: "Bottle", price: 35, active: true },
  { id: "p_milk_1000ml", name: "Milk Bottle (1000 ml)", category: "Milk", unit: "Bottle", price: 65, active: true },
  { id: "p_curd_500g", name: "Curd (500 g)", category: "Curd", unit: "Pack", price: 50, active: true },
  { id: "p_curd_1kg", name: "Curd (1 kg)", category: "Curd", unit: "Pack", price: 100, active: true },
  { id: "p_paneer_200g", name: "Paneer (200 g)", category: "Paneer", unit: "Pack", price: 110, active: true },
  { id: "p_paneer_500g", name: "Paneer (500 g)", category: "Paneer", unit: "Pack", price: 250, active: true },
];

export const EMPTY_DATA = { products: DEFAULT_PRODUCTS, customers: [], orders: [], recurring: [] };
export const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const CATEGORY_ICON = { Milk: "🥛", Paneer: "🧀", Curd: "🥣" };
