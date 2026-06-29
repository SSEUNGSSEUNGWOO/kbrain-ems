export default function PretrainingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='bg-background min-h-screen'>
      <main className='mx-auto max-w-2xl px-4 py-6 md:py-10'>{children}</main>
    </div>
  );
}
