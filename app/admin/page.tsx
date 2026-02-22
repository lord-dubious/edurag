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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your knowledge base performance and system status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/admin/domains">
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="relative overflow-hidden hover:bg-accent/50 transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer border-t-4" style={{ borderTopColor: stat.bg.split(' ')[0].replace('bg-', 'var(--').replace('-100', ')') }}>
              <div
                className={`absolute inset-0 opacity-[0.03] pointer-events-none ${stat.bg}`}
                style={{ backgroundImage: `radial-gradient(circle at right top, currentcolor 10%, transparent 60%)` }}
              />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-3xl font-bold tracking-tight">{stat.value.toLocaleString()}</div>
                {stat.badge && (
                  <Badge variant="secondary" className="mt-3">
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

            <div className="pt-6 mt-6 border-t">
              <p className="text-sm text-muted-foreground mb-4">Need help configuring EduRAG?</p>
              <Button asChild variant="secondary" className="w-full">
                <Link href="/setup">
                  Re-run Setup Wizard
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
