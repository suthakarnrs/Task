import { useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { format, subDays } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { dashboardAPI } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'

const COLORS = {
  matched: '#10b981',
  partially_matched: '#f59e0b',
  not_matched: '#ef4444',
  duplicate: '#8b5cf6'
}

const STATUS_LABELS = {
  matched: 'Matched',
  partially_matched: 'Partially Matched',
  not_matched: 'Not Matched',
  duplicate: 'Duplicates'
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState({
    dateFrom: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    dateTo: format(new Date(), 'yyyy-MM-dd')
  })

  const queryClient = useQueryClient()

  const { data: summary, isLoading: summaryLoading } = useQuery(
    ['dashboard-summary', dateRange],
    () => dashboardAPI.getSummary(dateRange),
    { refetchInterval: 30000 }
  )

  const { data: trends, isLoading: trendsLoading } = useQuery(
    ['dashboard-trends', dateRange],
    () => dashboardAPI.getTrends(dateRange),
    { refetchInterval: 60000 }
  )

  const { data: activity } = useQuery(
    ['dashboard-activity'],
    () => dashboardAPI.getActivity({ limit: 5 }),
    { refetchInterval: 30000 }
  )

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const summaryData = summary?.data
  const trendsData = trends?.data
  const activityData = activity?.data

  // Prepare chart data
  const reconciliationData = [
    { 
      name: STATUS_LABELS.matched, 
      value: summaryData?.reconciliation?.matched || 0, 
      color: COLORS.matched,
      key: 'matched'
    },
    { 
      name: STATUS_LABELS.partially_matched, 
      value: summaryData?.reconciliation?.partially_matched || 0, 
      color: COLORS.partially_matched,
      key: 'partially_matched'
    },
    { 
      name: STATUS_LABELS.not_matched, 
      value: summaryData?.reconciliation?.not_matched || 0, 
      color: COLORS.not_matched,
      key: 'not_matched'
    },
    { 
      name: STATUS_LABELS.duplicate, 
      value: summaryData?.reconciliation?.duplicate || 0, 
      color: COLORS.duplicate,
      key: 'duplicate'
    },
  ].filter(item => item.value > 0) 

  const totalReconciliationRecords = reconciliationData.reduce((sum, item) => sum + item.value, 0)

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value, name }) => {
    if (percent < 0.05) return null 
    
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="600"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  const renderTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.name}</p>
          <p className="text-sm text-gray-600">
            Count: <span className="font-medium">{data.value.toLocaleString()}</span>
          </p>
          <p className="text-sm text-gray-600">
            Percentage: <span className="font-medium">{((data.value / totalReconciliationRecords) * 100).toFixed(1)}%</span>
          </p>
        </div>
      )
    }
    return null
  }

  const accuracyTrends = trendsData?.reconciliationTrends?.map(item => ({
    date: format(new Date(item.date), 'MMM dd'),
    accuracy: item.accuracy,
    total: item.total
  })) || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            onClick={() => {
              queryClient.invalidateQueries(['dashboard-summary'])
              queryClient.invalidateQueries(['dashboard-trends'])
              queryClient.invalidateQueries(['dashboard-activity'])
            }}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">From</label>
              <input
                type="date"
                value={dateRange.dateFrom}
                onChange={(e) => setDateRange(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">To</label>
              <input
                type="date"
                value={dateRange.dateTo}
                onChange={(e) => setDateRange(prev => ({ ...prev, dateTo: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DocumentTextIcon className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Records</dt>
                <dd className="text-2xl font-bold text-gray-900">
                  {summaryData?.uploads?.totalRecords?.toLocaleString() || 0}
                </dd>
                <dd className="text-xs text-gray-500 mt-1 truncate">
                  {summaryData?.uploads?.processedRecords?.toLocaleString() || 0} processed
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Matched Records</dt>
                <dd className="text-2xl font-bold text-gray-900">
                  {summaryData?.reconciliation?.matched?.toLocaleString() || 0}
                </dd>
                <dd className="text-xs text-green-600 mt-1 font-medium truncate">
                  {summaryData?.reconciliation?.total > 0 
                    ? `${((summaryData.reconciliation.matched / summaryData.reconciliation.total) * 100).toFixed(1)}% of total`
                    : 'No data'
                  }
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircleIcon className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Unmatched Records</dt>
                <dd className="text-2xl font-bold text-gray-900">
                  {summaryData?.reconciliation?.not_matched?.toLocaleString() || 0}
                </dd>
                <dd className="text-xs text-red-600 mt-1 font-medium truncate">
                  {summaryData?.reconciliation?.total > 0 
                    ? `${((summaryData.reconciliation.not_matched / summaryData.reconciliation.total) * 100).toFixed(1)}% of total`
                    : 'No data'
                  }
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="card p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                <span className="text-white font-bold text-lg">
                  {summaryData?.reconciliation?.accuracy || 0}%
                </span>
              </div>
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Accuracy Rate</dt>
                <dd className="text-lg font-semibold text-gray-900 truncate">
                  Match Success
                </dd>
                <dd className="text-xs text-gray-500 mt-1 truncate">
                  {summaryData?.reconciliation?.partially_matched || 0} partial matches
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">Reconciliation Status</h3>
            {totalReconciliationRecords > 0 && (
              <div className="text-sm text-gray-500">
                Total: {totalReconciliationRecords.toLocaleString()} records
              </div>
            )}
          </div>
          
          {reconciliationData.length > 0 ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={reconciliationData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomLabel}
                      outerRadius={100}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="value"
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {reconciliationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={renderTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {reconciliationData.map((item) => (
                  <div key={item.key} className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.value.toLocaleString()} ({((item.value / totalReconciliationRecords) * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <XCircleIcon className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-lg font-medium">No reconciliation data available</p>
              <p className="text-sm">Upload and process files to see reconciliation status</p>
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-gray-900">Accuracy Trends</h3>
            {accuracyTrends.length > 0 && (
              <div className="text-sm text-gray-500">
                Last {accuracyTrends.length} days
              </div>
            )}
          </div>
          
          {trendsLoading ? (
            <div className="flex items-center justify-center h-64">
              <LoadingSpinner />
            </div>
          ) : accuracyTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={accuracyTrends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis 
                  domain={[0, 100]} 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  label={{ value: 'Accuracy (%)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  formatter={(value, name) => [`${value}%`, 'Accuracy']}
                  labelFormatter={(label) => `Date: ${label}`}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="accuracy" 
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <DocumentTextIcon className="w-12 h-12 mb-3 text-gray-300" />
              <p className="text-lg font-medium">No trend data available</p>
              <p className="text-sm">Process more files to see accuracy trends</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {activityData?.recentUploads?.length > 0 ? (
            activityData.recentUploads.map((upload) => (
              <div key={upload._id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center">
                  <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{upload.originalName}</p>
                    <p className="text-sm text-gray-500">
                      Uploaded by {upload.uploadedBy.username} • {upload.processedRecords} records processed
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    upload.status === 'completed' ? 'bg-green-100 text-green-800' :
                    upload.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {upload.status}
                  </span>
                  <span className="ml-2 text-sm text-gray-500">
                    {format(new Date(upload.createdAt), 'MMM dd, HH:mm')}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  )
}