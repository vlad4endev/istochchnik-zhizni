import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function OfflinePage() {
  return (
    <Center mih="100dvh" p="md">
      <Stack align="center" gap="md" maw={400}>
        <Title order={2}>Нет подключения</Title>
        <Text c="dimmed" ta="center">
          Проверьте интернет и попробуйте снова.
        </Text>
        <Button component={Link} to="/" variant="light">
          На главную
        </Button>
      </Stack>
    </Center>
  );
}
