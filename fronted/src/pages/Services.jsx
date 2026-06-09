import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { getPipelineProjects } from '../api/pipeline_projects'
import { getServices, getServiceStatus } from '../api/services'
import { getSyncInterval } from '../api/variants'
import PipelineSelect from '../components/PipelineSelect'
import ServiceSidebar from '../features/services/ServiceSidebar'
import ServicePanel from '../features/services/ServicePanel'

export default function Services() {
  const { data: projects = [] } = useQuery({
    queryKey: ['pipeline-projects'],
    queryFn: getPipelineProjects,
    staleTime: Infinity,
  })

  const { data: intervals = {} } = useQuery({
    queryKey: ['sync-interval'],
    queryFn: getSyncInterval,
    staleTime: Infinity,
  })
  const memoryLimitDefault = intervals.service_memory_limit_default ?? '4g'

  const [pipelineId, setPipelineId] = useState(
    () => localStorage.getItem('services_pipeline') ?? null
  )

  useEffect(() => {
    if (!pipelineId && projects.length > 0) setPipelineId(projects[0].id)
  }, [projects, pipelineId])

  useEffect(() => {
    if (pipelineId) localStorage.setItem('services_pipeline', pipelineId)
  }, [pipelineId])

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services', pipelineId],
    queryFn: () => getServices(pipelineId),
    enabled: !!pipelineId,
  })

  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => { setSelectedId(null) }, [pipelineId])

  // Poll status for all services
  const statusResults = useQueries({
    queries: services.map(s => ({
      queryKey: ['service-status', pipelineId, s.id],
      queryFn: () => getServiceStatus(s.id, pipelineId),
      refetchInterval: 3000,
      enabled: !!pipelineId,
    })),
  })
  const statusMap = Object.fromEntries(
    services.map((s, i) => [s.id, statusResults[i]?.data?.up ?? false])
  )

  // Auto-select: running service first, then first in list. Only when nothing is selected.
  useEffect(() => {
    if (selectedId || services.length === 0) return
    const running = services.find(s => statusMap[s.id])
    setSelectedId((running ?? services[0]).id)
  }, [services, statusMap, selectedId])

  const selectedService = services.find(s => s.id === selectedId) ?? null

  if (!pipelineId && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
        Cargando proyectos…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Pipeline selector */}
      {projects.length > 1 && (
        <div className="shrink-0 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <div className="w-48">
            <PipelineSelect
              value={pipelineId ?? ''}
              onChange={setPipelineId}
              projects={projects}
              showAll={false}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center w-full text-sm text-gray-400 dark:text-gray-500">
            Cargando servicios…
          </div>
        ) : (
          <>
            <ServiceSidebar
              services={services}
              statusMap={statusMap}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />

            <div className="flex-1 min-w-0 overflow-hidden">
              {selectedService ? (
                <ServicePanel
                  key={`${pipelineId}:${selectedService.id}`}
                  service={selectedService}
                  isUp={statusMap[selectedService.id] ?? false}
                  pipelineId={pipelineId}
                  memoryLimitDefault={memoryLimitDefault}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
                  Selecciona un servicio
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
