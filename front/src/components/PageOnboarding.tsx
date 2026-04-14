import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function PageOnboarding(props: {
  title: string
  steps: { title: string; detail: string }[]
}) {
  const { title, steps } = props
  return (
    <Card className="border-dashed border-primary/25 bg-muted/20 print:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Кратко, как пользоваться этим экраном</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{s.title}</span>
              {' — '}
              {s.detail}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
