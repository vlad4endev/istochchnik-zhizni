export type ServiceItemType = 'song' | 'sermon' | 'announcement' | 'other';

export type ServiceItem = {
  id: string;
  title: string;
  type: ServiceItemType;
  durationMinutes: number;
  assignedTo: string;
};

export type ServiceItemWithTime = ServiceItem & {
  calculatedStartTime: string; // "10:05"
};

