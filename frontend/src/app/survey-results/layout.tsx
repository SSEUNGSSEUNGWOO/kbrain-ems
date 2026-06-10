export default function PublicSurveyResultsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='min-h-screen bg-background'>
      <main className='mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10'>{children}</main>
    </div>
  );
}
