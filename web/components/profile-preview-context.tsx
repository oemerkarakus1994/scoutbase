"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { EntityProfileModal } from "@/components/entity-profile-modal";

export type ProfilePreviewState =
  | { kind: "person"; id: string }
  | { kind: "verein"; id: string }
  | null;

type Ctx = {
  openPerson: (id: string) => void;
  openVerein: (id: string) => void;
  close: () => void;
};

const ProfilePreviewContext = createContext<Ctx | null>(null);

export function useProfilePreview(): Ctx | null {
  return useContext(ProfilePreviewContext);
}

export function ProfilePreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProfilePreviewState>(null);

  const openPerson = useCallback((id: string) => {
    setState({ kind: "person", id });
  }, []);

  const openVerein = useCallback((id: string) => {
    setState({ kind: "verein", id });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  const value = useMemo(
    () => ({ openPerson, openVerein, close }),
    [openPerson, openVerein, close],
  );

  return (
    <ProfilePreviewContext.Provider value={value}>
      {children}
      <EntityProfileModal state={state} onClose={close} />
    </ProfilePreviewContext.Provider>
  );
}
