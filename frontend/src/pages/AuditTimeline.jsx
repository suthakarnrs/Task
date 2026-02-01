import { useQuery } from 'react-query'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { auditAPI } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ArrowLeftIcon,
  UserCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
  CloudArrowUpIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

const actionIcons = {
  create: DocumentTextIcon,
  update: PencilSquareIcon,
  delete: TrashIcon,
  upload: CloudArrowUpIcon,
  reconcile: CheckCircleIcon,
  resolve: CheckCircleIcon,
}

const actionColors = {
  create: 'bg-green-100 text-green-600',
  update: 'bg-blue-100 text-blue-600',
  delete: 'bg-red-100 text-red-600',
  upload: 'bg-purple-100 text-purple-600',
  reconcile: 'bg-yellow-100 text-yellow-600',
  resolve: 'bg-green-100 text-green-600',
}

export default function AuditTimeline() {
  const { entityType, entityId } = useParams()

  const { data: timeline, isLoading, error } = useQuery(
    ['audit-timeline', entityType, entityId],
    () => auditAPI.getTimeline(entityType, entityId),
    {
      enabled: !!entityType && !!entityId
    }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <DocumentTextIcon className="mx-auto h-12 w-12" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">Error Loading Timeline</h3>
        <p className="text-sm text-gray-500 mt-1">
          {error.response?.data?.message || 'Failed to load audit timeline'}
        </p>
      </div>
    )
  }

  const timelineData = timeline?.data?.timeline || []

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link
          to="/reconciliation"
          className="flex items-center text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-1" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Timeline</h1>
          <p className="text-sm text-gray-500">
            {entityType.replace('_', ' ')} • {entityId}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-6">
        {timelineData.length === 0 ? (
          <div className="text-center py-12">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Timeline Data</h3>
            <p className="mt-1 text-sm text-gray-500">
              No audit events found for this entity.
            </p>
          </div>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {timelineData.map((event, eventIdx) => {
                const ActionIcon = actionIcons[event.action] || DocumentTextIcon
                const isLast = eventIdx === timelineData.length - 1

                return (
                  <li key={event.id}>
                    <div className="relative pb-8">
                      {!isLast && (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${actionColors[event.action] || 'bg-gray-100 text-gray-600'}`}>
                            <ActionIcon className="h-4 w-4" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div className="flex-1">
                            <p className="text-sm text-gray-500">
                              <span className="font-medium text-gray-900">
                                {event.user?.username || 'System'}
                              </span>{' '}
                              <span className="capitalize">{event.action}d</span> the{' '}
                              <span className="font-medium">{entityType.replace('_', ' ')}</span>
                            </p>
                            
                            {/* Changes */}
                            {event.changes && event.changes.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {event.changes.map((change, idx) => (
                                  <div key={idx} className="text-xs bg-gray-50 rounded p-2">
                                    <div className="font-medium text-gray-700 mb-1">
                                      {change.field}:
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      {change.oldValue !== undefined && (
                                        <>
                                          <span className="text-red-600 bg-red-50 px-2 py-1 rounded">
                                            {String(change.oldValue)}
                                          </span>
                                          <span className="text-gray-400">→</span>
                                        </>
                                      )}
                                      <span className="text-green-600 bg-green-50 px-2 py-1 rounded">
                                        {String(change.newValue)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* New Value (for creates) */}
                            {event.action === 'create' && event.newValue && (
                              <div className="mt-2 text-xs bg-green-50 rounded p-2">
                                <div className="font-medium text-gray-700 mb-1">Created with:</div>
                                <pre className="text-green-700 whitespace-pre-wrap">
                                  {JSON.stringify(event.newValue, null, 2)}
                                </pre>
                              </div>
                            )}

                            {/* Source and metadata */}
                            <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                              <span className="flex items-center">
                                <UserCircleIcon className="h-3 w-3 mr-1" />
                                {event.source || 'web_ui'}
                              </span>
                              {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <span>
                                  Additional data available
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            <div>{format(new Date(event.timestamp), 'MMM dd, yyyy')}</div>
                            <div className="text-xs">
                              {format(new Date(event.timestamp), 'HH:mm:ss')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Entity Details */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Entity Information</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Entity Type</dt>
            <dd className="text-sm text-gray-900 capitalize">
              {entityType.replace('_', ' ')}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Entity ID</dt>
            <dd className="text-sm text-gray-900 font-mono">{entityId}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Total Events</dt>
            <dd className="text-sm text-gray-900">{timelineData.length}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">First Event</dt>
            <dd className="text-sm text-gray-900">
              {timelineData.length > 0 
                ? format(new Date(timelineData[timelineData.length - 1].timestamp), 'MMM dd, yyyy HH:mm')
                : 'N/A'
              }
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}