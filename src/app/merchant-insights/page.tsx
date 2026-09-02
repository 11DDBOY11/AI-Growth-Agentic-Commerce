import { get_unmet_demand } from '@/lib/commerce';
import { Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function MerchantInsights() {
  const unmetDemands = get_unmet_demand();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-3xl font-bold font-mono">Merchant Insights</h1>
          <p className="text-gray-400 text-sm mt-2 font-mono">Unmet Demand: What customers asked for but couldn't find.</p>
        </header>

        <div className="space-y-4 font-mono text-sm">
          {unmetDemands.length === 0 ? (
            <div className="text-center text-gray-500 mt-10 p-8 bg-gray-800 rounded-lg border border-gray-700">
              No unmet demand recorded yet.
            </div>
          ) : (
            unmetDemands.map((item: any, idx: number) => (
              <div key={idx} className="p-4 border-l-4 rounded border-blue-500 text-blue-400 bg-gray-800 shadow-sm flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Search size={16} />
                    <span className="font-bold text-gray-100">
                      Query: "{item.query}" &mdash; asked {item.count || 1}x
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 shrink-0 text-right">
                  Last asked: <br />
                  {new Date(item.timestamp).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
