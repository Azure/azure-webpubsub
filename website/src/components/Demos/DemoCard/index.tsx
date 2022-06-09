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

const previewProps: IDocumentCardPreviewProps = {
  previewImages: [
    {
      name: 'Scoreboard',
      linkProps: {
        href: '#',
        target: '_blank',
      },
      previewImageSrc: '/img/card-scoreboard.png',
      imageFit: ImageFit.cover,
    },
  ],
}

export interface DemoCardProps {
  name: string
  title: string
  docLink: string
  liveDemoLink: string
}

export default function DemoCard(props: DemoCardProps): JSX.Element {
  console.log(props)
  return (
    <DocumentCard aria-label={props.name}>
      <DocumentCardPreview {...previewProps} />
      <DocumentCardLocation location={props.name} locationHref={props.docLink} ariaLabel={props.name} />
      <DocumentCardTitle title={props.title} styles={styles.title} />
      <DocumentCardTitle title={'Is this recommendation helpful?'} shouldTruncate showAsSecondaryTitle />
      <Separator></Separator>
      <Stack horizontal horizontalAlign="space-between" styles={styles.footer}>
        <StackItem style={styles.footerItem}>
          <Stack horizontal horizontalAlign="space-between">
            <PrimaryButton
              text="Try demo"
              allowDisabledFocus
              onClick={(): void => {
                window.location.href = props.liveDemoLink
              }}
            />
            <Link styles={styles.link} href={props.docLink}>
              See details
            </Link>
          </Stack>
        </StackItem>
        <StackItem style={styles.footerItem}>
          <FontIcon aria-label="Share" iconName="Share" className={styles.classNames.share} />
        </StackItem>
      </Stack>
    </DocumentCard>
  )
}
