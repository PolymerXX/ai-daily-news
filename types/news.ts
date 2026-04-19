export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishTime: string;
  category: string;
  highlight: boolean;
  content: string;
}

export type NewsCategory = '大模型' | '芯片' | '政策' | '应用' | '开源';