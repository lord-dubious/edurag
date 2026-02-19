import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';

export const revalidate = 60;

export default async function AdminDashboard() {
  const domainsCol = await getMongoCollection(env.DOMAINS_COLLECTION);
  const vectorCol = await getMongoCollection(env.VECTOR_COLLECTION);
  const faqCol = await getMongoCollection(env.FAQ_COLLECTION);

  const [domainCount, totalDocs, pendingFaqs] = await Promise.all([
    domainsCol.countDocuments(),
    vectorCol.countDocuments(),
    faqCol.countDocuments({ pendingApproval: true }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-card rounded-lg border">
          <div className="text-sm text-muted-foreground">Domains</div>
          <div className="text-3xl font-bold">{domainCount}</div>
        </div>
        <div className="p-6 bg-card rounded-lg border">
          <div className="text-sm text-muted-foreground">Indexed Documents</div>
          <div className="text-3xl font-bold">{totalDocs}</div>
        </div>
        <div className="p-6 bg-card rounded-lg border">
          <div className="text-sm text-muted-foreground">Pending FAQs</div>
          <div className="text-3xl font-bold">{pendingFaqs}</div>
        </div>
      </div>
    </div>
  );
}
