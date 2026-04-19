'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Star, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: '首页', href: '/', icon: Home },
  { name: '收藏', href: '/favorites', icon: Star },
  { name: '关于', href: '/about', icon: Info },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-border lg:hidden">
      <div className="flex items-center justify-around h-16">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-all duration-200',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5', isActive && 'scale-110')} />
              <span className="text-xs">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
