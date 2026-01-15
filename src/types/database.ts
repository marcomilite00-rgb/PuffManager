export type StaffRole = 'admin' | 'staff' | 'helper';
export type ReservationStatus = 'RESERVED' | 'CANCELLED' | 'SOLD';
export type OrderStatus = 'COMPLETED' | 'PARTIAL_PAYMENT';

export interface Staff {
    id: string;
    name: string;
    role: StaffRole;
    has_pin?: boolean;        // Computed: pin_hash IS NOT NULL
    pin_version?: number;     // For session invalidation
    pin_hash?: string;        // Internal only - never exposed via API
    created_at: string;
    updated_at?: string;
}

export interface ProductVariant {
    id: string;
    model_id: string;
    flavor_id: string;
    default_price: number;
    unit_cost: number | null;
    photo_urls: string[];
    video_urls: string[];
    active: boolean;
    model_name?: string;
    flavor_name?: string;
    qty?: number;
}

export interface Inventory {
    variant_id: string;
    qty: number;
}

export interface Reservation {
    id: string;
    created_at: string;
    created_by_staff_id: string;
    customer_name: string | null;
    status: ReservationStatus;
    total_override: number | null;
}

export interface Order {
    id: string;
    created_at: string;
    sold_by_staff_id: string;
    customer_name: string | null;
    gross_total: number;
    status: OrderStatus;
}
