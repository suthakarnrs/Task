import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { uploadAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  CloudArrowUpIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline'

export default function Upload() {
  const [currentStep, setCurrentStep] = useState(1) // 1: Upload, 2: Preview, 3: Mapping
  const [uploadedFile, setUploadedFile] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const { register, handleSubmit, setValue, watch } = useForm()

  // Check permissions
  if (!hasPermission(['admin', 'analyst'])) {
    return (
      <div className="text-center py-12">
        <ExclamationCircleIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">
          You don't have permission to upload files.
        </p>
      </div>
    )
  }

  // File upload mutation
  const uploadMutation = useMutation(
    (formData) => uploadAPI.uploadFile(formData, (progressEvent) => {
      const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
      setUploadProgress(progress)
    }),
    {
      onSuccess: (response) => {
        setJobId(response.data.jobId)
        setCurrentStep(2)
        toast.success('File uploaded successfully')
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Upload failed')
      }
    }
  )

  // Get file preview
  const { data: previewData, isLoading: previewLoading } = useQuery(
    ['file-preview', jobId],
    () => uploadAPI.getPreview(jobId),
    {
      enabled: !!jobId && currentStep === 2,
      onSuccess: (response) => {
        // Auto-map columns if they match exactly
        const headers = response.data.headers
        const mapping = {}
        
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase()
          if (lowerHeader.includes('transaction') && lowerHeader.includes('id')) {
            mapping.transactionId = header
          } else if (lowerHeader.includes('amount')) {
            mapping.amount = header
          } else if (lowerHeader.includes('reference')) {
            mapping.referenceNumber = header
          } else if (lowerHeader.includes('date')) {
            mapping.date = header
          } else if (lowerHeader.includes('description')) {
            mapping.description = header
          } else if (lowerHeader.includes('category')) {
            mapping.category = header
          }
        })
        
        // Set form values
        Object.keys(mapping).forEach(key => {
          setValue(key, mapping[key])
        })
      }
    }
  )

  // Submit column mapping
  const mappingMutation = useMutation(
    (mapping) => uploadAPI.submitMapping(jobId, mapping),
    {
      onSuccess: () => {
        setCurrentStep(3)
        toast.success('Processing started')
        queryClient.invalidateQueries(['upload-jobs'])
      },
      onError: (error) => {
        toast.error(error.response?.data?.message || 'Failed to start processing')
      }
    }
  )

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setUploadedFile(acceptedFiles[0])
      }
    }
  })

  const handleFileUpload = () => {
    if (!uploadedFile) return
    
    const formData = new FormData()
    formData.append('file', uploadedFile)
    
    uploadMutation.mutate(formData)
  }

  const handleMappingSubmit = (data) => {
    mappingMutation.mutate(data)
  }

  const resetUpload = () => {
    setCurrentStep(1)
    setUploadedFile(null)
    setJobId(null)
    setUploadProgress(0)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Transaction Data</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload CSV or Excel files with transaction data for reconciliation
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {[
              { id: 1, name: 'Upload File', status: currentStep >= 1 ? 'complete' : 'upcoming' },
              { id: 2, name: 'Preview & Map', status: currentStep >= 2 ? 'complete' : currentStep === 2 ? 'current' : 'upcoming' },
              { id: 3, name: 'Processing', status: currentStep >= 3 ? 'complete' : 'upcoming' },
            ].map((step, stepIdx) => (
              <li key={step.id} className={`relative ${stepIdx !== 2 ? 'pr-8 sm:pr-20' : ''}`}>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  {stepIdx !== 2 && (
                    <div className={`h-0.5 w-full ${step.status === 'complete' ? 'bg-primary-600' : 'bg-gray-200'}`} />
                  )}
                </div>
                <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                  step.status === 'complete' ? 'bg-primary-600' : 
                  step.status === 'current' ? 'border-2 border-primary-600 bg-white' : 
                  'border-2 border-gray-300 bg-white'
                }`}>
                  {step.status === 'complete' ? (
                    <CheckCircleIcon className="h-5 w-5 text-white" />
                  ) : (
                    <span className={`text-sm font-medium ${
                      step.status === 'current' ? 'text-primary-600' : 'text-gray-500'
                    }`}>
                      {step.id}
                    </span>
                  )}
                </div>
                <span className="ml-4 text-sm font-medium text-gray-900">{step.name}</span>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Step 1: File Upload */}
      {currentStep === 1 && (
        <div className="card p-6">
          <div className="space-y-6">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-4">
                <p className="text-sm text-gray-600">
                  {isDragActive ? 'Drop the file here' : 'Drag and drop a file here, or click to select'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports CSV, XLSX, XLS files up to 50MB
                </p>
              </div>
            </div>

            {uploadedFile && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <DocumentTextIcon className="h-8 w-8 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUploadedFile(null)}
                  className="text-sm text-red-600 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            )}

            {uploadMutation.isLoading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleFileUpload}
                disabled={!uploadedFile || uploadMutation.isLoading}
                className="btn btn-primary disabled:opacity-50"
              >
                {uploadMutation.isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  'Upload File'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Preview & Column Mapping */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {previewLoading ? (
            <div className="card p-6 text-center">
              <LoadingSpinner size="lg" />
              <p className="mt-2 text-sm text-gray-600">Loading file preview...</p>
            </div>
          ) : (
            <>
              {/* File Preview */}
              <div className="card">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">File Preview</h3>
                  <p className="text-sm text-gray-500">
                    {previewData?.data.filename} • {previewData?.data.totalRows} rows
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {previewData?.data.headers.map((header) => (
                          <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {previewData?.data.preview.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          {previewData.data.headers.map((header) => (
                            <td key={header} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {row[header]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column Mapping */}
              <div className="card p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Column Mapping</h3>
                <p className="text-sm text-gray-600 mb-6">
                  Map your file columns to the required system fields
                </p>
                
                <form onSubmit={handleSubmit(handleMappingSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'transactionId', label: 'Transaction ID', required: true },
                      { key: 'amount', label: 'Amount', required: true },
                      { key: 'referenceNumber', label: 'Reference Number', required: true },
                      { key: 'date', label: 'Date', required: true },
                      { key: 'description', label: 'Description', required: false },
                      { key: 'category', label: 'Category', required: false },
                    ].map((field) => (
                      <div key={field.key}>
                        <label className="label">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        <select
                          {...register(field.key, { required: field.required })}
                          className="input"
                        >
                          <option value="">Select column...</option>
                          {previewData?.data.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="btn btn-secondary"
                    >
                      Start Over
                    </button>
                    <button
                      type="submit"
                      disabled={mappingMutation.isLoading}
                      className="btn btn-primary"
                    >
                      {mappingMutation.isLoading ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Starting Processing...
                        </>
                      ) : (
                        'Start Processing'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Processing */}
      {currentStep === 3 && (
        <div className="card p-6 text-center">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-600" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">Processing Started</h3>
          <p className="mt-1 text-sm text-gray-500">
            Your file is being processed. You can monitor the progress in the dashboard.
          </p>
          <div className="mt-6">
            <button
              onClick={resetUpload}
              className="btn btn-primary"
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}
    </div>
  )
}