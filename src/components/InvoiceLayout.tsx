import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, FilePlus } from 'lucide-react'

const navItems = [
  { to: '/invoices', end: true,  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/invoices/create',      icon: FilePlus,        label: 'Create Invoice' },
]

export default function InvoiceLayout() {
  return (
    <div className="flex min-h-full">
      {/* Sub-nav sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] px-3 py-8">
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
                    ? 'bg-[rgba(108,92,231,0.12)] text-nyx-accent'
                    : 'text-nyx-muted hover:text-nyx-text hover:bg-[rgba(255,255,255,0.04)]',
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
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  )
}
