"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const defaultFrameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"] as const;

const defaultRoleItems = [
  { label: "Developer", value: "developer" },
  { label: "Designer", value: "designer" },
  { label: "Manager", value: "manager" },
  { label: "Other", value: "other" },
];

export interface UserInfoFormProps {
  title?: string;
  description?: string;
  frameworks?: readonly string[];
  roleItems?: Array<{ label: string; value: string }>;
  defaultValues?: {
    name?: string;
    role?: string;
    framework?: string;
    comments?: string;
  };
  onSubmit?: (data: { name: string; role: string; framework: string; comments: string }) => void;
  onCancel?: () => void;
}

export function UserInfoForm({
  title = "User Information",
  description = "Please fill in your details below",
  frameworks = defaultFrameworks,
  roleItems = defaultRoleItems,
  defaultValues,
  onSubmit,
  onCancel,
}: UserInfoFormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onSubmit?.({
      name: formData.get("name") as string,
      role: (formData.get("role") as string | null) ?? "",
      framework: formData.get("framework") as string,
      comments: (formData.get("comments") as string | null) ?? "",
    });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="user-form-name">Name</FieldLabel>
                <Input
                  id="user-form-name"
                  name="name"
                  placeholder="Enter your name"
                  defaultValue={defaultValues?.name}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="user-form-role">Role</FieldLabel>
                <Select items={roleItems} defaultValue={defaultValues?.role ?? null} name="role">
                  <SelectTrigger id="user-form-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roleItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="user-form-framework">Framework</FieldLabel>
              <Combobox items={frameworks} name="framework">
                <ComboboxInput id="user-form-framework" placeholder="Select a framework" required />
                <ComboboxContent>
                  <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
                  <ComboboxList>
                    {(item) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-form-comments">Comments</FieldLabel>
              <Textarea
                id="user-form-comments"
                name="comments"
                placeholder="Add any additional comments"
                defaultValue={defaultValues?.comments}
              />
            </Field>
            <Field orientation="horizontal">
              <Button type="submit">Submit</Button>
              <Button variant="outline" type="button" onClick={onCancel}>
                Cancel
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
