import { Brain, Cpu, Gavel, Zap, LucideIcon } from 'lucide-react';

export const CATEGORIES = ['全部', '大模型', '芯片', '政策', '应用', '开源'] as const;

export const categoryColors: Record<string, string> = {
  '大模型': 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  '芯片': 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  '政策': 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  '应用': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  '开源': 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
};

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  bgColor: string;
}

export const FEATURES: Feature[] = [
  {
    icon: Brain,
    title: '大模型追踪',
    description: '第一时间了解GPT、Claude、LLaMA等主流大模型的最新动态',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    icon: Cpu,
    title: '芯片硬件',
    description: '关注英伟达、AMD、华为等公司的AI芯片发展',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    icon: Gavel,
    title: '政策法规',
    description: '解读全球AI监管政策，把握行业合规方向',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    icon: Zap,
    title: '应用创新',
    description: '探索AI在各行业的创新应用和商业落地',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
];
