import {
  Building2,
  CalendarDays,
  CreditCard,
  HeartPulse,
  Landmark,
  Package,
  Palette,
  Pill,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';

export const fallbackTenants = [
  {
    name: 'Iliria Hospital',
    image:
      'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1200&q=80',
    accent: 'from-amber-400/35 to-orange-500/10',
    icon: Landmark,
  },
  {
    name: 'Dardania Clinic',
    image:
      'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80',
    accent: 'from-sky-400/35 to-cyan-500/10',
    icon: HeartPulse,
  },
  {
    name: 'American Hospital',
    image:
      'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80',
    accent: 'from-emerald-400/35 to-teal-500/10',
    icon: Building2,
  },
  {
    name: 'Polyclinic Diagnoze',
    image:
      'https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=1200&q=80',
    accent: 'from-fuchsia-400/30 to-violet-500/10',
    icon: Stethoscope,
  },
];

export const audience = [
  'Hospital groups',
  'Private clinics',
  'Polyclinics',
  'Care teams',
  'Patients',
];

export const features = [
  {
    icon: Palette,
    title: 'Launch branded healthcare landing pages',
    description:
      'Give each organization its own identity with custom visuals, messaging, service catalog, and pricing presentation.',
    color: 'from-amber-400/20 to-orange-500/10',
  },
  {
    icon: Package,
    title: 'Present services, plans, and products clearly',
    description:
      'Help visitors understand what you offer before they register, select a plan, or book care.',
    color: 'from-sky-400/20 to-cyan-500/10',
  },
  {
    icon: CalendarDays,
    title: 'Turn interest into booked appointments',
    description:
      'Move patients from discovery into registration, enrollment, scheduling, and follow-up without a fragmented experience.',
    color: 'from-emerald-400/20 to-teal-500/10',
  },
  {
    icon: Users,
    title: 'Support multiple organizations on one platform',
    description:
      'Run separate brands and service catalogs in one system while keeping each organization clearly scoped.',
    color: 'from-fuchsia-400/20 to-violet-500/10',
  },
  {
    icon: Pill,
    title: 'Extend the journey beyond the visit',
    description:
      'Use post-appointment offers and product flows to keep care, recommendations, and commerce connected.',
    color: 'from-rose-400/20 to-pink-500/10',
  },
  {
    icon: Stethoscope,
    title: 'Keep the patient experience guided',
    description:
      'Reduce confusion with a cleaner path from arrival to selection, booking, and next-step care.',
    color: 'from-indigo-400/20 to-blue-500/10',
  },
];

export const journey = [
  {
    icon: Sparkles,
    title: 'Attract',
    text: 'Bring visitors into a branded healthcare experience that feels specific to your organization.',
    tone: 'from-amber-400/20 to-orange-500/10',
  },
  {
    icon: CreditCard,
    title: 'Convert',
    text: 'Guide them through registration, plan discovery, and clear service selection.',
    tone: 'from-sky-400/20 to-cyan-500/10',
  },
  {
    icon: CalendarDays,
    title: 'Book',
    text: 'Move qualified patients into appointment scheduling and operational workflows faster.',
    tone: 'from-emerald-400/20 to-teal-500/10',
  },
  {
    icon: Pill,
    title: 'Retain',
    text: 'Continue the experience with post-care offers, product flows, and repeat engagement.',
    tone: 'from-fuchsia-400/20 to-violet-500/10',
  },
];

export const benefits = [
  'Launch a polished digital front door for every healthcare brand you manage.',
  'Reduce friction between patient discovery, registration, and appointment booking.',
  'Present plans, services, doctors, and products in one connected experience.',
  'Scale across multiple organizations without losing brand control.',
];

export const trustSignals = [
  'Built for multi-organization healthcare operations.',
  'Supports branded experiences per tenant, not one generic portal.',
  'Designed to connect acquisition, enrollment, booking, and follow-up.',
  'Flexible enough for clinics, hospitals, and polyclinics with different offers.',
];

export const pricing = [
  {
    tier: 'Small Clinic',
    price: 'EUR 1,500',
    summary:
      'A focused package for smaller providers building a modern digital journey.',
    bar: 'w-1/3 bg-gradient-to-r from-amber-400 to-orange-500',
  },
  {
    tier: 'Medium',
    price: 'EUR 5,000',
    summary:
      'A stronger operational setup for growing organizations with more complexity.',
    bar: 'w-2/3 bg-gradient-to-r from-sky-400 to-cyan-500',
  },
  {
    tier: 'Hospital',
    price: 'EUR 10,000',
    summary:
      'A broader solution for larger healthcare operators and multi-brand groups.',
    bar: 'w-full bg-gradient-to-r from-emerald-400 to-teal-500',
  },
];

export const testimonials = [
  {
    quote:
      'Health Nexus gives us one place to present services, capture registrations, and move patients into booking without a disconnected process.',
    author: 'Operations Lead',
    company: 'Dardania Clinic',
  },
  {
    quote:
      'The branded tenant experience is what stood out. We can keep our identity while still operating on one shared platform.',
    author: 'Digital Programs Manager',
    company: 'American Hospital',
  },
  {
    quote:
      'It feels less like separate tools stitched together and more like one guided healthcare journey from first visit to follow-up.',
    author: 'Commercial Director',
    company: 'Polyclinic Diagnoze',
  },
];

export const faqs = [
  {
    question: 'Who is Health Nexus built for?',
    answer:
      'Health Nexus is designed for hospitals, clinics, polyclinics, and healthcare groups that want one platform for branded acquisition, enrollment, booking, and follow-up care journeys.',
  },
  {
    question:
      'Can each organization keep its own brand and service catalog?',
    answer:
      'Yes. Each tenant can present its own branding, messaging, services, doctors, products, and pricing while still operating on the same platform.',
  },
  {
    question: 'What happens after a patient registers?',
    answer:
      'Patients can move from discovery into registration, plan selection, appointment booking, and post-appointment offers through one connected flow.',
  },
];
