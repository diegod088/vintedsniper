export interface VintedItem {
  id: number;
  title: string;
  price: number;
  currency: string;
  brand: string;
  size: string;
  condition: string;
  url: string;
  photo_url: string;
  photo_urls: string[];
  seller: {
    id: number;
    login: string;
    business: boolean;
    feedback_reputation: number;
    feedback_count: number;
  };
  created_at: string;
  location?: string;
  time_ago?: string;
  description?: string;
  original_index?: number;
}
