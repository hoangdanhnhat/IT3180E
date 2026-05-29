import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listTicketCategories } from '../api/tickets'
import { CATEGORY_LABELS } from '../constants/enums'

export default function useTicketCategories() {
  const query = useQuery({
    queryKey: ['ticket-categories'],
    queryFn: listTicketCategories,
    staleTime: 5 * 60 * 1000,
  })

  const categoryLabels = useMemo(() => {
    const labels = { ...CATEGORY_LABELS }
    for (const category of query.data ?? []) {
      labels[category.key] = category.label
    }
    return labels
  }, [query.data])

  return {
    ...query,
    categories: query.data ?? [],
    categoryLabels,
  }
}
