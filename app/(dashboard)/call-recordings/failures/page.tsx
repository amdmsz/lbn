import { redirect } from "next/navigation";
import { CallRecordingsWorkbench } from "@/components/calls/call-recordings-workbench";
import {
  canAccessCallRecordingModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  getCallRecordingFilterOptions,
  getCallRecordingWorkbenchData,
} from "@/lib/calls/recording-queries";

export default async function CallRecordingFailuresPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCallRecordingModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [data, filterOptions] = await Promise.all([
    getCallRecordingWorkbenchData(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      resolvedSearchParams,
      "failures",
    ),
    Promise.resolve(getCallRecordingFilterOptions()),
  ]);

  return (
    <CallRecordingsWorkbench
      data={data}
      recordingStatuses={filterOptions.recordingStatuses}
      aiStatuses={filterOptions.aiStatuses}
    />
  );
}
