import { Link } from 'react-router-dom'
import { Button, Reveal } from '../../../components/shared/ui'

// Bookends the hero: same brand-gradient/dot-texture treatment, right before the footer. Only
// rendered for signed-out visitors (see Home.tsx) — telling an existing member to "join" would
// be irrelevant, not charming.
export function ClosingCta() {
  return (
    <Reveal tag="section" className="text-center">
      <div className="relative -mx-4 sm:mx-0 sm:rounded-2xl bg-gradient-to-br from-brand via-brand to-brand-dark py-14 px-6 text-white overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="relative">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-balance">Ready to reconnect?</h2>
          <p className="text-white/80 max-w-md mx-auto mb-6">
            Join fellow alumni already building their network, discovering opportunities, and giving back.
          </p>
          <Link to="/signup">
            <Button className="px-6 py-3 text-base rounded-full bg-white text-brand hover:bg-white/90 shadow-lg shadow-black/10">
              Join Alumni Community
            </Button>
          </Link>
        </div>
      </div>
    </Reveal>
  )
}
