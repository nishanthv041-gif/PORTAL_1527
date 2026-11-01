"use client";

import React from "react";
import AdminBusManagement from "@/frontend/components/transport/AdminBusManagement";

interface TransportClientProps {
  initialBuses: any[];
  teachers: any[];
  classes: any[];
  initialAlerts: any[];
  currentUserRole: string;
  currentUserName: string;
}

export default function TransportClient({
  initialBuses,
  teachers,
  classes,
  initialAlerts,
  currentUserRole,
  currentUserName,
}: TransportClientProps) {
  return (
    <AdminBusManagement
      initialBuses={initialBuses}
      staffList={teachers}
      classes={classes}
      recentMessages={initialAlerts}
      currentUserName={currentUserName}
      teachers={teachers}
      initialAlerts={initialAlerts}
      currentUserRole={currentUserRole}
    />
  );
}
