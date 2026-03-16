import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';
import { requireAdmin } from '@/lib/admin-guard';
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
  ArrowRight,
  Activity,
  CheckCircle2,
  Clock
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await requireAdmin();
  const domainsCol = await getMongoCollection(env.DOMAINS_COLLECTION);
  const vectorCol = await getMongoCollection(env.VECTOR_COLLECTION);
  const faqCol = await getMongoCollection(env.FAQ_COLLECTION);

  const [domainCount, totalDocs, pendingFaqs, totalFaqs] = await Promise.all([
    domainsCol.countDocuments(),
    vectorCol.countDocuments(),
    faqCol.countDocuments({ pendingApproval: true }),
    faqCol.countDocuments({ public: true }),
  ]);
  const recentDomains = await domainsCol
    .find({})
    .sort({ lastCrawled: -1, createdAt: -1 })
    .limit(5)
    .toArray();
  const lastCrawled = recentDomains.find(d => d.lastCrawled)?.lastCrawled ?? null;

  const stats = [
    {
      title: 'Domains',
      value: domainCount,
      icon: Globe,
      href: '/admin/domains',
      color: 'text-blue-600',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      helper: domainCount > 0 ? `${domainCount} active` : 'No domains yet',
    },
    {
      title: 'Indexed Documents',
      value: totalDocs,
      icon: FileText,
      href: '/admin/domains',
      color: 'text-green-600',
      bg: 'bg-green-100 dark:bg-green-900/30',
      helper: totalDocs > 0 ? 'Search-ready' : 'Awaiting first crawl',
    },
    {
      title: 'Pending FAQs',
      value: pendingFaqs,
      icon: HelpCircle,
      href: '/admin/faqs',
      color: 'text-amber-600',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      badge: pendingFaqs > 0 ? `${pendingFaqs} pending` : undefined,
      helper: pendingFaqs > 0 ? 'Needs review' : 'All caught up',
    },
    {
      title: 'Public FAQs',
      value: totalFaqs,
      icon: MessageSquare,
      href: '/admin/faqs',
      color: 'text-purple-600',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      helper: totalFaqs > 0 ? 'Published answers' : 'None published yet',
    },
  ];

  const isEmpty = domainCount === 0 && totalDocs === 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="rounded-2xl border bg-gradient-to-br from-background via-background to-muted/40 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              Admin Overview
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-2">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Monitor indexing, FAQs, and system activity at a glance.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild>
              <Link href="/admin/domains">
                <Plus className="mr-2 h-4 w-4" />
                Add Domain
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/knowledge-base">
                Crawl Settings
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="relative overflow-hidden hover:bg-accent/50 transition-all hover:shadow-lg hover:-translate-y-1 cursor-pointer">
              <div className={`absolute inset-0 opacity-[0.04] pointer-events-none ${stat.bg}`} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent className="relative z-10 space-y-2">
                <div className="text-3xl font-bold tracking-tight">{stat.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{stat.helper}</div>
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
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
            <Button asChild variant="secondary" className="w-full justify-between">
              <Link href="/admin/settings">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Update Settings
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full justify-between">
              <Link href="/setup">
                <span className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  Re-run Setup Wizard
                </span>
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last Crawl</span>
              <span className="font-medium">
                {lastCrawled ? new Date(lastCrawled).toLocaleDateString() : 'Not yet'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Index Health</span>
              <span className="font-medium">{totalDocs > 0 ? 'Healthy' : 'Empty'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">FAQs Pending</span>
              <span className="font-medium">{pendingFaqs > 0 ? `${pendingFaqs} waiting` : 'None'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Domains</span>
              <span className="font-medium">{domainCount > 0 ? `${domainCount} connected` : 'No domains'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Crawl Activity</CardTitle>
            <p className="text-sm text-muted-foreground">Latest domains and crawl status</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/domains">
              View all
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentDomains.length === 0 ? (
            <div className="text-sm text-muted-foreground">No domains yet. Add one to start crawling.</div>
          ) : (
            <div className="space-y-2">
              {recentDomains.map((domain) => (
                <div key={domain._id.toString()} className="flex items-center justify-between border rounded-lg px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{domain.name || domain.url}</div>
                    <div className="text-xs text-muted-foreground truncate">{domain.url}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {domain.lastCrawled ? new Date(domain.lastCrawled).toLocaleDateString() : 'Not crawled'}
                    </span>
                    <Badge variant={domain.status === 'error' ? 'destructive' : domain.status === 'crawling' ? 'secondary' : domain.status === 'indexed' ? 'default' : 'outline'}>
                      {domain.status || 'pending'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isEmpty && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>1. Add your university domain to crawl.</div>
            <div>2. Run the crawl to index documents.</div>
            <div>3. Review and approve FAQs for the landing page.</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
