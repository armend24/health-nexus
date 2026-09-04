# Component structure

**Shared** (used across routes):

- **ui/** – shadcn components (`npx shadcn add <component>`)
- **atoms/** – smallest reusable building blocks (e.g. Icon, Label)
- **molecules/** – compositions (AppSidebar, SiteHeader, NavMain, SectionCards, DataTable, ChartAreaInteractive)

**Layouts**

- **/** – company landing page
- **/dashboard** – sidebar + header

**Route-specific** – colocated as `-components/` (the `-` prefix excludes from TanStack Router)
