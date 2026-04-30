import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { getServices, getServiceStatus } from '../api/services'
import ServiceSidebar from '../features/services/ServiceSidebar'
import ServicePanel from '../features/services/ServicePanel'

export default function Services() {
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: getServices,
  })

  const [selectedId, setSelectedId] = useState(null)

  // Poll status for all services
  const statusResults = useQueries({
    queries: services.map(s => ({
      queryKey: ['service-status', s.id],
      queryFn: () => getServiceStatus(s.id),
      refetchInterval: 3000,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
        Cargando servicios…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <ServiceSidebar
        services={services}
        statusMap={statusMap}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedService ? (
          <ServicePanel
            key={selectedService.id}
            service={selectedService}
            isUp={statusMap[selectedService.id] ?? false}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
            Selecciona un servicio
          </div>
        )}
      </div>
    </div>
  )
}
