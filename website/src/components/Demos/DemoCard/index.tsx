import * as React from 'react'
import {
  DocumentCard,
  DocumentCardPreview,
  DocumentCardTitle,
  IDocumentCardPreviewProps,
  DocumentCardLocation,
  Link,
  Separator,
  FontIcon,
  PrimaryButton,
  Stack,
  StackItem,
  ImageFit,
} from '@fluentui/react'
import * as styles from './styles.module'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

export interface DemoCardProps {
  name: string
  title: string
  docLink: string
  liveDemoLink: string
}

export default function DemoCard(props: DemoCardProps): JSX.Element {
  const previewImageProps: IDocumentCardPreviewProps = {
    previewImages: [
      {
        name: props.name,
        linkProps: {
          href: props.docLink,
          target: '_blank',
        },
        previewImageSrc: '/img/card-scoreboard.png', // todo: use real demo image
        imageFit: ImageFit.cover,
      },
    ],
  }
  const { siteConfig } = useDocusaurusContext()
  const status = siteConfig.customFields.developmentStatus

  return (
    <DocumentCard aria-label={props.name}>
      <DocumentCardPreview {...previewImageProps} />
      <DocumentCardLocation location={props.name} locationHref={props.docLink} ariaLabel={props.name} />
      <DocumentCardTitle title={props.title} styles={styles.title} />
      <DocumentCardTitle title={'Is this recommendation helpful?'} shouldTruncate showAsSecondaryTitle />
      <Separator></Separator>
      <Stack horizontal horizontalAlign="space-between" styles={styles.footer}>
        {status.isShareReady && <StackItem style={styles.footerItem}>{LeftFooter(props)}</StackItem>}
        {!status.isShareReady && LeftFooter(props)}
        {status.isShareReady && (
          <StackItem style={styles.footerItem}>
            <FontIcon aria-label="Share" iconName="Share" className={styles.classNames.share} />
          </StackItem>
        )}
      </Stack>
    </DocumentCard>
  )
}

function LeftFooter(props: DemoCardProps): JSX.Element {
  return (
    <>
      <StackItem style={styles.footerItem}>
        <PrimaryButton text="Try demo" allowDisabledFocus href={props.liveDemoLink ? props.liveDemoLink : props.docLink} target="_blank" />
      </StackItem>
      <StackItem style={styles.footerItem}>
        <Stack verticalAlign="space-bewteen">
          <Link styles={styles.link} href={props.docLink} target="_blank">
            See details
          </Link>
        </Stack>
      </StackItem>
    </>
  )
}
