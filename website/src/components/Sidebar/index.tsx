import React from 'react'
import { Stack, Label, Link } from '@fluentui/react'
import * as styles from './styles.module'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

export interface SidebarProps {
  docId: string
}

export default function Sidebar(props: SidebarProps): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  const sidebarConfig = siteConfig.customFields.sidebar
  const status = siteConfig.customFields.developmentStatus as DevelopmentStatus
  const paths = props.docId.split('/')
  paths.length -= 1
  const docPath = paths.join('/')
  const repoLink = `${sidebarConfig.sampleRoot}/${docPath}`

  return (
    <Stack styles={styles.sidebar} tokens={styles.tokens}>
      <Label styles={styles.title}>Useful links</Label>
      <Link href={sidebarConfig.reviewLink} target="_blank">
        Write a review
      </Link>
      {status.isShareReady && (
        <Link href={sidebarConfig.shareLink} target="_blank">
          Share to social media
        </Link>
      )}
      <Link href={sidebarConfig.docLink} target="_blank">
        View documentation
      </Link>
      <Link href={repoLink} target="_blank">
        Go to Github project page
      </Link>
    </Stack>
  )
}
