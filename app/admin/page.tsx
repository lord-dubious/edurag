import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Globe,
  FileText,
  HelpCircle,
  MessageSquare,
  Plus,
  ArrowRight
} from 'lucide-react';

export const revalidate = 60;

export default async function AdminDashboard() {
  const domainsCol = await getMongoCollection(env.DOMAINS_COLLECTION);
  const vectorCol = await getMongoCollection(env.VECTOR_COLLECTION);
  const faqCol = await getMongoCollection(env.FAQ_COLLECTION);

  const [domainCount, totalDocs, pendingFaqs, totalFaqs] = await Promise.all([
    domainsCol.countDocuments(),
    vectorCol.countDocuments(),
    faqCol.countDocuments({ pendingApproval: true }),
    faqCol.countDocuments({ public: true }),
  ]);

  const stats = [
    {
      title: 'Domains',
      value: domainCount,
      icon: Globe,
      href: '/admin/domains',
      color: 'text-blue-600',
      bg: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      title: 'Indexed Documents',
      value: totalDocs,
      icon: FileText,
      href: '/admin/domains',
      color: 'text-green-600',
      bg: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Pending FAQs',
      value: pendingFaqs,
      icon: HelpCircle,
      href: '/admin/faqs',
      color: 'text-amber-600',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      badge: pendingFaqs > 0 ? `${pendingFaqs} pending` : undefined
    },
    {
      title: 'Public FAQs',
      value: totalFaqs,
      icon: MessageSquare,
      href: '/admin/faqs',
      color: 'text-purple-600',
      bg: 'bg-purple-100 dark:bg-purple-900/30'
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your knowledge base
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="hover:bg-accent/50 transition-all hover:shadow-md hover:-translate-y-1 cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                {stat.badge && (
                  <Badge variant="secondary" className="mt-2">
                    {stat.badge}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-between">
              <Link href="/admin/domains">
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add New Domain
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/admin/faqs">
                <span className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Review Pending FAQs
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Vector Index</span>
                <Badge variant="default" className="bg-green-600">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chat API</span>
                <Badge variant="default" className="bg-green-600">Online</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Crawl Service</span>
                <Badge variant="default" className="bg-green-600">Ready</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
