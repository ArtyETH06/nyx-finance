import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, FilePlus } from 'lucide-react'

const navItems = [
  { to: '/invoices', end: true,  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/invoices/create',      icon: FilePlus,        label: 'Create Invoice' },
]

export default function InvoiceLayout() {
  return (
    <div className="flex h-full min-h-0">
      {/* Sub-nav sidebar */}
      <aside className="w-52 flex-shrink-0 self-stretch border-r border-nyx-border px-3 py-8">
        <p className="text-[10px] font-semibold tracking-widest text-nyx-muted uppercase mb-4 px-3">
          Invoices
        </p>
        <nav className="space-y-0.5">
          {navItems.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                  isActive
                    ? 'bg-nyx-active text-nyx-accent'
                    : 'text-nyx-muted hover:text-nyx-text hover:bg-nyx-hover',
                ].join(' ')
              }
            >
              <Icon size={14} strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Page content */}
      <div className="flex-1 h-full overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
