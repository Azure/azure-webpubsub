import React from 'react'
import renderRoutes from '@docusaurus/renderRoutes'
import Layout from '@theme/Layout'
import NotFound from '@theme/NotFound'
import BackToTopButton from '@theme/BackToTopButton'
import { matchPath } from '@docusaurus/router'
import { translate } from '@docusaurus/Translate'
import clsx from 'clsx'
import styles from './styles.module.css'
import { HtmlClassNameProvider, ThemeClassNames, docVersionSearchTag, DocsSidebarProvider, DocsVersionProvider } from '@docusaurus/theme-common'
import SearchMetadata from '@theme/SearchMetadata'

function DocPageContent({ versionMetadata, children }) {
  const { pluginId, version } = versionMetadata

  return (
    <>
      <SearchMetadata version={version} tag={docVersionSearchTag(pluginId, version)} />
      <Layout>
        <div className={styles.docPage}>
          <BackToTopButton />
          <div
            className={styles.collapsedDocSidebar}
            title={translate({
              id: 'theme.docs.sidebar.expandButtonTitle',
              message: 'Expand sidebar',
              description: 'The ARIA label and title attribute for expand button of doc sidebar',
            })}
            aria-label={translate({
              id: 'theme.docs.sidebar.expandButtonAriaLabel',
              message: 'Expand sidebar',
              description: 'The ARIA label and title attribute for expand button of doc sidebar',
            })}
            tabIndex={0}
            role="button"
          ></div>
          <main className={clsx(styles.docMainContainer, styles.docMainContainerEnhanced)}>
            <div className={clsx('container padding-top--md padding-bottom--lg', styles.docItemWrapper, styles.docItemWrapperEnhanced)}>{children}</div>
          </main>
        </div>
      </Layout>
    </>
  )
}

export default function DocPage(props): JSX.Element {
  const {
    route: { routes: docRoutes },
    versionMetadata,
    location,
  } = props
  const currentDocRoute = docRoutes.find(docRoute => matchPath(location.pathname, docRoute))

  if (!currentDocRoute) {
    return <NotFound />
  } // For now, the sidebarName is added as route config: not ideal!

  return (
    <HtmlClassNameProvider className={clsx(ThemeClassNames.wrapper.docsPages, ThemeClassNames.page.docsDocPage, versionMetadata.className)}>
      <DocsVersionProvider version={versionMetadata}>
        <DocsSidebarProvider sidebar={null}>
          <DocPageContent versionMetadata={versionMetadata}>
            {renderRoutes(docRoutes, {
              versionMetadata,
            })}
          </DocPageContent>
        </DocsSidebarProvider>
      </DocsVersionProvider>
    </HtmlClassNameProvider>
  )
}
