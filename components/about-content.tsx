import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code, ExternalLink } from 'lucide-react';
import { FEATURES, CATEGORIES } from '@/lib/constants';

export default function AboutContent() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="mb-12">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          关于每日AI资讯
        </h1>
        <p className="text-muted-foreground text-lg">
          汇聚全球AI领域最新动态，为AI从业者和爱好者提供高质量的资讯服务
        </p>
      </header>

      <Card className="mb-8 border-border/50">
        <CardHeader>
          <CardTitle>平台简介</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-invert max-w-none">
          <p className="text-muted-foreground leading-relaxed">
            每日AI资讯是一个专注于人工智能领域的资讯聚合平台。我们致力于为读者提供及时、准确、全面的AI行业动态，
            涵盖大模型、芯片、政策、应用和开源等多个维度。
          </p>
          <p className="text-muted-foreground leading-relaxed mt-4">
            无论您是AI从业者、研究人员、投资人还是技术爱好者，这里都有您需要的内容。
            我们通过智能分类和精准筛选，帮助您快速获取最相关的资讯。
          </p>
        </CardContent>
      </Card>

      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-6">核心功能</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((feature, index) => (
            <Card key={index} className="border-border/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
              <CardHeader>
                <div className={`inline-flex p-3 rounded-lg ${feature.bgColor} mb-3`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-6">资讯分类</h2>
        <div className="flex flex-wrap gap-3">
          {CATEGORIES.filter(c => c !== '全部').map((category) => (
            <Badge
              key={category}
              variant="outline"
              className="px-4 py-2 text-base font-medium border-primary/20 hover:border-primary/40 transition-colors"
            >
              {category}
            </Badge>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">技术栈</h2>
        <Card className="border-border/50">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-gradient-to-br from-black to-gray-800 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">N</span>
                </div>
                <div>
                  <h3 className="font-semibold">Next.js 14</h3>
                  <p className="text-sm text-muted-foreground">App Router + TypeScript</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">TW</span>
                </div>
                <div>
                  <h3 className="font-semibold">Tailwind CSS</h3>
                  <p className="text-sm text-muted-foreground">响应式设计 + 深色主题</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-gradient-to-br from-gray-900 to-gray-700 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">UI</span>
                </div>
                <div>
                  <h3 className="font-semibold">shadcn/ui</h3>
                  <p className="text-sm text-muted-foreground">高质量组件库</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 text-center">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Code className="h-5 w-5" />
          <span>开源项目</span>
          <ExternalLink className="h-4 w-4" />
        </a>
      </section>
    </div>
  );
}