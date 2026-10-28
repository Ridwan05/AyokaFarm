import type { Kpi } from '../components/ui/KpiCard'

// Mock data matching P-D2 · Pen 2. Only Pen 2 has full detail in the design.

export type DailyEntry = {
  date: string
  died: number
  feedBags: number
  feedVsExpected: number
  eggs: number
  layingRate: number
  medication: string | null
  recordedBy: string
  /** Late entries are shown in the info colour. */
  late?: boolean
}

export type PenDetail = {
  penId: number
  title: string
  subtitle: string
  spike: {
    title: string
    body: string
  } | null
  kpis: Kpi[]
  mortality: {
    daily: number[]
    thresholdBirds: number
    thresholdLabel: string
    /** Days at the end of the series flagged as a rising streak. */
    risingDays: number
    xLabels: string[]
    note: string
    typical: string
    /** Highest daily loss that's normal for this flock. */
    typicalMax: number
  }
  flock: {
    code: string
    breed: string
    placed: string
    age: string
    birdsPlaced: number
    liveNow: number
    feedType: string
    expectedFeed: string
    withdrawal: string
  }
  entries: DailyEntry[]
}

export const penDetails: Record<number, PenDetail> = {
  2: {
    penId: 2,
    title: 'Pen 2 · Layers',
    subtitle: 'Flock L-2602 · Isa Brown · placed 06 Mar 2026 as day-old chicks · week 31',
    spike: {
      title: 'Mortality spike — 9 birds today (0.8%), above the 0.5% threshold',
      body: 'Last 3 days: 2 · 3 · 9. Recorded by Kemi at 07:12 with note “some birds sneezing, water line low”. Check drinkers and respiratory signs; consider calling the vet. Owner notified on WhatsApp.',
    },
    kpis: [
      {
        label: 'Live birds', value: '1,108', unit: 'birds', delta: '−92', trend: 'flat', sentiment: 'neutral',
        context: 'of 1,200 placed', info: 'Birds alive in this pen',
        spark: [1110, 1110, 1110, 1111, 1110, 1110, 1110, 1108],
      },
      {
        label: 'Flock mortality', value: '7.7', unit: '%', delta: '+1.7 pts', trend: 'up', sentiment: 'bad',
        context: 'vs breed std 6.0%', info: 'Birds lost since placement ÷ birds placed',
        spark: [6.9, 6.9, 7.0, 7.0, 7.0, 7.0, 7.3, 7.7],
      },
      {
        label: 'Laying rate', value: '90.1', unit: '%', delta: '+0.6 pts', trend: 'up', sentiment: 'good',
        context: 'vs last week', info: 'Eggs collected ÷ live hens',
        spark: [89.2, 89.4, 89.3, 89.6, 89.7, 89.8, 90.0, 90.1],
      },
      {
        label: 'Margin this month', value: '486', unit: 'thousand ₦', delta: '+9%', trend: 'up', sentiment: 'good',
        context: 'vs September', info: 'Egg sales minus feed, medication and allocated costs',
        spark: [440, 446, 444, 452, 458, 462, 476, 486],
      },
    ],
    mortality: {
      daily: [1, 0, 2, 1, 0, 1, 3, 1, 0, 2, 1, 1, 0, 2, 1, 0, 1, 2, 1, 0, 1, 1, 2, 0, 1, 1, 2, 2, 3, 9],
      thresholdBirds: 5.6,
      thresholdLabel: 'Threshold 0.5% ≈ 6 birds',
      risingDays: 3,
      xLabels: ['10 Sep', '17 Sep', '24 Sep', '01 Oct', '09 Oct'],
      note: 'Rising 3 days in a row',
      typical: 'Typical day for this flock: 0–2 birds',
      typicalMax: 2,
    },
    flock: {
      code: 'L-2602',
      breed: 'Isa Brown',
      placed: '06 Mar 2026 · day-old',
      age: '31 weeks 0 days',
      birdsPlaced: 1200,
      liveNow: 1108,
      feedType: 'Layer mash',
      expectedFeed: '115 g / bird / day',
      withdrawal: 'None active',
    },
    entries: [
      { date: 'Fri 09/10', died: 9, feedBags: 5.3, feedVsExpected: 3.1, eggs: 999, layingRate: 90.1, medication: null, recordedBy: 'Kemi · 07:12' },
      { date: 'Thu 08/10', died: 3, feedBags: 5.1, feedVsExpected: 1.4, eggs: 1012, layingRate: 91.4, medication: null, recordedBy: 'Kemi · 06:55' },
      { date: 'Wed 07/10', died: 2, feedBags: 5.0, feedVsExpected: -0.6, eggs: 1021, layingRate: 91.2, medication: 'Vitalyte 50 g', recordedBy: 'Kemi · 07:03' },
      { date: 'Tue 06/10', died: 2, feedBags: 5.0, feedVsExpected: -0.8, eggs: 1018, layingRate: 91.5, medication: null, recordedBy: 'Kemi · 06:47' },
      { date: 'Mon 05/10', died: 1, feedBags: 5.1, feedVsExpected: 1.0, eggs: 1025, layingRate: 91.9, medication: null, recordedBy: 'Bayo (cover) · 07:20' },
      { date: 'Sun 04/10', died: 1, feedBags: 5.0, feedVsExpected: -1.2, eggs: 1015, layingRate: 91.3, medication: null, recordedBy: 'Kemi · 06:58' },
      { date: 'Sat 03/10', died: 0, feedBags: 5.0, feedVsExpected: -1.3, eggs: 1030, layingRate: 92.4, medication: null, recordedBy: 'Late · Kemi, 04/10 08:31', late: true },
    ],
  },
}
