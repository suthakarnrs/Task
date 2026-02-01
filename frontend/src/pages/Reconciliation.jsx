import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { reconciliationAPI, uploadAPI } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

const statusIcons = {
  matched: CheckCircleIcon,
  partially_matched: ExclamationTriangleIcon,
  not_matched: XCircleIcon,
  duplicate: DocumentDuplicateIcon,
}

const statusColors = {
  matched: 'text-green-600 bg-green-100',
  partially_matched: 'text-yellow-600 bg-yellow-100',
  not_matched: 'text-red-600 bg-red-100',
  duplicate: 'text-purple-600 bg-purple-100',
}

export default function Reconciliation() {
  const [filters, setFilters] = useState({
    uploadJobId: '',
    matchStatus: '',
    page: 1,
    limit: 20
  })
  const [selectedResult, setSelectedResult] = useState(null)
  const [showResolveModal, setShowResolveModal] = useState(false)
  
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()

  // Get reconciliation results
  const { data: results, isLoading } = useQuery(
    ['reconciliation-results', filters],
    () => {
      // Filter out empty values to avoid validation errors
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([key, value]) => value !== '' && value !== null && value !== undefined)
      )
      return reconciliationAPI.getResults(cleanFilters)
    },
    { keepPreviousData: true }
  )

  // Get upload jobs for filter dropdown
  const { data: uploadJobs } = useQuery(
    ['upload-jobs'],
    () => uploadAPI.getJobs({ limit: 100 })
  )

  // Manual resolution mutation
  const resolveMutation = useMutation(
    ({ id, resolution }) => reconciliationAPI.resolveManually(id, resolution),
    {
      onSuccess: () => {
        toast.success('Reconciliation resolved successfully')
        setShowResolveModal(false)
        setSelectedResult(null)
        queryClient.invalidateQueries(['reconciliation-results'])
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to resolve reconciliation')
      }
    }
  )

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }))
  }

  const handleResolve = (result) => {
    setSelectedResult(result)
    setShowResolveModal(true)
  }

  const formatDifferences = (differences) => {
    if (!differences || differences.length === 0) return 'No differences'
    
    return differences.map(diff => (
      <div key={diff.field} className="text-xs">
        <span className="font-medium">{diff.field}:</span>
        <span className="text-red-600 ml-1">{String(diff.uploadedValue)}</span>
        <span className="mx-1">→</span>
        <span className="text-green-600">{String(diff.systemValue)}</span>
      </div>
    ))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const resultsData = results?.data?.results || []
  const pagination = results?.data?.pagination || {}

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Reconciliation Results</h1>
      </div>

      {/* Filters */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Upload Job</label>
            <select
              value={filters.uploadJobId}
              onChange={(e) => handleFilterChange('uploadJobId', e.target.value)}
              className="input"
            >
              <option value="">All uploads</option>
              {uploadJobs?.data?.jobs?.map((job) => (
                <option key={job._id} value={job._id}>
                  {job.originalName} ({format(new Date(job.createdAt), 'MMM dd')})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="label">Match Status</label>
            <select
              value={filters.matchStatus}
              onChange={(e) => handleFilterChange('matchStatus', e.target.value)}
              className="input"
            >
              <option value="">All statuses</option>
              <option value="matched">Matched</option>
              <option value="partially_matched">Partially Matched</option>
              <option value="not_matched">Not Matched</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>
          
          <div>
            <label className="label">Records per page</label>
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="input"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Match Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Differences
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {resultsData.map((result) => {
                const StatusIcon = statusIcons[result.matchStatus]
                return (
                  <tr key={result._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {result.uploadedRecordId?.transactionId}
                      </div>
                      <div className="text-sm text-gray-500">
                        Ref: {result.uploadedRecordId?.referenceNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${result.uploadedRecordId?.amount?.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[result.matchStatus]}`}>
                        <StatusIcon className="w-4 h-4 mr-1" />
                        {result.matchStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(result.matchScore * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      {formatDifferences(result.differences)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Link
                        to={`/audit/reconciliation_result/${result._id}`}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        <EyeIcon className="w-4 h-4 inline" />
                      </Link>
                      {hasPermission(['admin', 'analyst']) && !result.isManuallyResolved && (
                        <button
                          onClick={() => handleResolve(result)}
                          className="text-green-600 hover:text-green-500"
                        >
                          <PencilIcon className="w-4 h-4 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((pagination.page - 1) * pagination.limit) + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  of <span className="font-medium">{pagination.total}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                    const page = i + 1
                    return (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          page === pagination.page
                            ? 'z-10 bg-primary-50 border-primary-500 text-primary-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resolve Modal */}
      {showResolveModal && selectedResult && (
        <ResolveModal
          result={selectedResult}
          onClose={() => {
            setShowResolveModal(false)
            setSelectedResult(null)
          }}
          onResolve={(resolution) => {
            resolveMutation.mutate({ id: selectedResult._id, resolution })
          }}
          isLoading={resolveMutation.isLoading}
        />
      )}
    </div>
  )
}

// Resolve Modal Component
function ResolveModal({ result, onClose, onResolve, isLoading }) {
  const [resolution, setResolution] = useState({
    matchStatus: result.matchStatus,
    systemRecordId: result.systemRecordId?._id || '',
    notes: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onResolve(resolution)
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Resolve Reconciliation
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Match Status</label>
              <select
                value={resolution.matchStatus}
                onChange={(e) => setResolution(prev => ({ ...prev, matchStatus: e.target.value }))}
                className="input"
                required
              >
                <option value="matched">Matched</option>
                <option value="partially_matched">Partially Matched</option>
                <option value="not_matched">Not Matched</option>
              </select>
            </div>
            
            <div>
              <label className="label">Notes</label>
              <textarea
                value={resolution.notes}
                onChange={(e) => setResolution(prev => ({ ...prev, notes: e.target.value }))}
                className="input"
                rows={3}
                placeholder="Add resolution notes..."
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Resolving...
                  </>
                ) : (
                  'Resolve'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}