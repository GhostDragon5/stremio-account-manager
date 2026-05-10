import { ExternalLink, Github, Heart } from 'lucide-react'

export function Footer() {
  return (
    <>
      <footer className="border-t border-border glass-card mt-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 md:flex md:items-center md:justify-center gap-2 sm:gap-4">
              <a
                href="https://ko-fi.com/ghostdragon5"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150 border md:border-transparent"
              >
                <Heart className="h-4 w-4" />
                Donate GhostDragon
              </a>
              <a
                href="https://ko-fi.com/alessioca"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150 border md:border-transparent"
              >
                <Heart className="h-4 w-4" />
                Donate Alessio
              </a>
              <a
                href="https://torbox.app/subscription?referral=93e879d8-b423-4864-a5f1-009e20bc8cf5"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150 border md:border-transparent"
              >
                <ExternalLink className="h-4 w-4" />
                TorBox
              </a>
              <a
                href="https://github.com/GhostDragon5/stremio-account-manager"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150 border md:border-transparent"
              >
                <Github className="h-4 w-4" />
                Source
              </a>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <span className="text-sm text-muted-foreground">
                Made by{' '}
                <a
                  href="https://github.com/GhostDragon5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  GhostDragon
                </a>
                {' '}fork from{' '}
                <a
                  href="https://alessio.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Alessio
                </a>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
